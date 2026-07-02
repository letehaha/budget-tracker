import { ACCOUNT_CATEGORIES, type LoanEvent, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import Balances from '@models/balances.model';
import LoanDetails from '@models/loan-details.model';
import Transactions from '@models/transactions.model';
import { withTransaction } from '@services/common/with-transaction';
import { parseISO, startOfDay } from 'date-fns';
import { Op, fn, col, where as sqlWhere } from 'sequelize';

/**
 * Recompute a loan's authoritative balance from its anchor snapshot plus
 * `transfer_to_loan` legs dated on/after `balanceAnchorDate` — pre-anchor legs
 * are baked into the snapshot and stay informational. Loans are NOT maintained
 * incrementally like ordinary accounts. Idempotent; no-op for non-loan accounts.
 *
 * `userId` is optional because the Transactions model hooks that trigger this
 * don't carry it; all queries after the lookup are scoped by the account's own userId.
 */
const recomputeLoanBalanceImpl = async ({
  loanAccountId,
  userId,
}: {
  loanAccountId: string;
  userId?: number;
}): Promise<void> => {
  const account = await Accounts.findOne({
    where: { id: loanAccountId, ...(userId !== undefined && { userId }) },
  });
  if (!account || account.accountCategory !== ACCOUNT_CATEGORIES.loan) return;

  const loanDetails = await LoanDetails.findOne({
    where: { accountId: loanAccountId, userId: account.userId },
  });
  if (!loanDetails) {
    // The account is a loan (guarded above) yet has no sidecar — a data-integrity
    // break. Report it instead of silently leaving the balance unmaintained.
    logger.error(
      {
        message: 'Loan account is missing its LoanDetails sidecar; balance left unrecomputed',
        error: new Error(`accountId=${loanAccountId}`),
      },
      { code: 'LOAN_RECOMPUTE_MISSING_DETAILS', loanAccountId },
    );
    return;
  }
  const anchorDate = loanDetails.balanceAnchorDate;
  const anchorDay = startOfDay(parseISO(anchorDate));

  const legs = await Transactions.findAll({
    where: {
      accountId: loanAccountId,
      userId: account.userId,
      transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
      // A loan account only ever holds the income legs of its payments; pinning
      // the type keeps a stray non-income leg from flipping the sign of the sum.
      transactionType: TRANSACTION_TYPES.income,
      // Only DATE(time) >= anchor adjusts the outstanding; the snapshot already
      // accounts for earlier payments.
      [Op.and]: [sqlWhere(fn('DATE', col('time')), Op.gte, anchorDate)],
    },
  });

  // Income legs move a negative liability balance toward zero, so they add.
  // Ref amounts are also grouped per calendar day for the history rebuild —
  // Balances rows are unique per (accountId, date).
  let sumCents = 0;
  let sumRefCents = 0;
  const refCentsByDay = new Map<number, number>();
  for (const leg of legs) {
    sumCents += leg.amount.toCents();
    sumRefCents += leg.refAmount.toCents();
    // SQL filters by DATE(time) but this grouping uses the server-local day;
    // clamp to the anchor day so a boundary-skewed leg folds into the anchor row
    // instead of landing before the cleanup range (which starts at the anchor).
    const legDay = Math.max(startOfDay(new Date(leg.time)).getTime(), anchorDay.getTime());
    refCentsByDay.set(legDay, (refCentsByDay.get(legDay) ?? 0) + leg.refAmount.toCents());
  }

  const newCurrentBalance = account.initialBalance.add(Money.fromCents(sumCents));
  const newRefCurrentBalance = account.refInitialBalance.add(Money.fromCents(sumRefCents));

  if (!newCurrentBalance.equals(account.currentBalance) || !newRefCurrentBalance.equals(account.refCurrentBalance)) {
    await Accounts.update(
      { currentBalance: newCurrentBalance, refCurrentBalance: newRefCurrentBalance },
      { where: { id: loanAccountId, userId: account.userId } },
    );
  }

  // Stamp paid_off only on the owing→settled transition so repeated recomputes
  // don't duplicate it; a reopened loan earns a fresh event when it re-zeroes.
  if (account.currentBalance.isNegative() && !newCurrentBalance.isNegative()) {
    const paidOffEvent: LoanEvent = { type: 'paid_off', at: new Date().toISOString() };
    await loanDetails.update({ events: [...(loanDetails.events ?? []), paidOffEvent] });
  }

  // Rebuild the loan's Balances history: one row on the anchor date (same-day
  // payments fold in — the anchor boundary is inclusive) plus one cumulative row
  // per later day with legs. Loans opt out of the per-transaction Balances
  // cascade, so this rebuild is the loan's only history writer; pre-anchor rows
  // stay untouched. Balances.amount stores the base-currency (ref) balance.
  const rebuiltRows: { date: Date; refBalance: Money }[] = [];
  let runningRefBalance = account.refInitialBalance;
  if (!refCentsByDay.has(anchorDay.getTime())) {
    rebuiltRows.push({ date: anchorDay, refBalance: runningRefBalance });
  }
  for (const day of [...refCentsByDay.keys()].toSorted((a, b) => a - b)) {
    runningRefBalance = runningRefBalance.add(Money.fromCents(refCentsByDay.get(day)!));
    rebuiltRows.push({ date: new Date(day), refBalance: runningRefBalance });
  }

  // Clear the range first so removed/moved payments leave no ghost rows; the
  // account-creation row falls inside it and is re-written by the anchor row.
  await Balances.destroy({
    where: { accountId: loanAccountId, date: { [Op.gte]: anchorDay } },
  });

  for (const row of rebuiltRows) {
    // Absolute upsert on (accountId, date) — race-safe against any concurrent
    // writer that lands between the cleanup above and this insert.
    await Balances.updateAccountBalance({
      accountId: loanAccountId,
      date: row.date,
      refBalance: row.refBalance,
    });
  }
};

export const recomputeLoanBalance = withTransaction(recomputeLoanBalanceImpl);
