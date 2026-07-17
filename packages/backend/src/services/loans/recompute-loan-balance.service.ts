import { ACCOUNT_CATEGORIES, type LoanEvent } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import Balances from '@models/balances.model';
import { namespace } from '@models/connection';
import LoanDetails from '@models/loan-details.model';
import type Transactions from '@models/transactions.model';
import { measureSpotRefBalance } from '@services/accounts/measure-spot-ref-balance';
import { withTransaction } from '@services/common/with-transaction';
import { getPostAnchorPaymentLegs } from '@services/loans/get-post-anchor-payment-legs';
import { replayLoanOutstanding } from '@services/loans/replay-loan-outstanding';
import { Op } from 'sequelize';

/**
 * The moment a loan actually settled: replay the post-anchor payment legs in
 * date order on top of the anchor balance and return the `time` of the first
 * leg at which the cumulative balance reaches zero. An anchor balance already
 * at/above zero (a manual correction straight to zero, no settling leg) means
 * the loan settled on the anchor date itself. Falls back to the current time
 * only when neither source applies.
 */
const resolveSettledAt = ({
  anchorBalanceCents,
  anchorDate,
  legs,
}: {
  anchorBalanceCents: number;
  /** yyyy-MM-dd anchor boundary. */
  anchorDate: string;
  legs: Transactions[];
}): string => {
  if (anchorBalanceCents >= 0) return new Date(anchorDate).toISOString();

  const sortedLegs = [...legs].toSorted((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  let cumulativeCents = anchorBalanceCents;
  for (const leg of sortedLegs) {
    cumulativeCents += leg.amount.toCents();
    if (cumulativeCents >= 0) return new Date(leg.time).toISOString();
  }
  return new Date().toISOString();
};

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
  // SELECT ... FOR UPDATE on the loan account row: every payment write path
  // (create/edit/link/unlink) already locks this row via
  // `assertLoanPaymentAllowed` before projecting the balance, and this lock
  // re-acquires it within the same transaction (a no-op there). The payment
  // delete path reaches this recompute without going through the guard, so the
  // lock here is what keeps a concurrent payment write from reading a
  // pre-delete balance and jointly persisting a stale outstanding.
  const sequelizeTx = namespace.get('transaction');
  const account = await Accounts.findOne({
    where: { id: loanAccountId, ...(userId !== undefined && { userId }) },
    transaction: sequelizeTx,
    lock: sequelizeTx?.LOCK.UPDATE,
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

  // Only DATE(time) >= anchor adjusts the outstanding; the snapshot already
  // accounts for earlier payments.
  const legs = await getPostAnchorPaymentLegs({
    loanAccountId,
    userId: account.userId,
    anchorDate,
  });

  // Income legs move a negative liability balance toward zero, so they add.
  let sumCents = 0;
  for (const leg of legs) {
    sumCents += leg.amount.toCents();
  }

  // Loan balances are stored negative (liability); income legs add toward zero.
  // A batch that overshoots the owed amount would push the balance positive
  // (credit), but a loan never carries credit — the outstanding balance is
  // floored at zero and the excess stays only on the cash-account expense legs.
  const rawCurrentBalance = account.initialBalance.add(Money.fromCents(sumCents));
  const newCurrentBalance = rawCurrentBalance.isPositive() ? Money.zero() : rawCurrentBalance;

  // The base-currency outstanding is a spot measure of the native outstanding —
  // what the remaining liability is worth at the latest rate — not the ref
  // anchor plus historical-rate payment legs (that blend leaves a base-currency
  // residue after the native balance settles). Deriving from the already-floored
  // native balance also keeps the two fields settling in lockstep instead of
  // flooring independently.
  //
  // A missing rate must not abort the recompute (a payment delete has to succeed):
  // keep the stored ref outstanding so the equals-guard below skips the ref side,
  // and let the daily remeasure self-heal it once a rate exists.
  const newRefCurrentBalance =
    (await measureSpotRefBalance({
      userId: account.userId,
      amount: newCurrentBalance,
      baseCode: account.currencyCode,
      site: 'recomputeLoanBalance',
    })) ?? account.refCurrentBalance;

  if (!newCurrentBalance.equals(account.currentBalance) || !newRefCurrentBalance.equals(account.refCurrentBalance)) {
    await Accounts.update(
      { currentBalance: newCurrentBalance, refCurrentBalance: newRefCurrentBalance },
      { where: { id: loanAccountId, userId: account.userId } },
    );
  }

  const events = loanDetails.events ?? [];

  // A settled→owing transition means the loan reopened (a payment edit/delete
  // pushed the balance back below zero) — the timeline must no longer claim the
  // loan is paid off, so every `paid_off` entry is dropped. Filtering ALL of
  // them (not just the last) also self-heals any duplicates already persisted.
  if (!account.currentBalance.isNegative() && newCurrentBalance.isNegative()) {
    const withoutPaidOff = events.filter((event) => event.type !== 'paid_off');
    if (withoutPaidOff.length !== events.length) {
      await loanDetails.update({ events: withoutPaidOff });
    }
  }

  // Stamp paid_off only on the owing→settled transition so repeated recomputes
  // don't duplicate it. `at` is the moment the loan actually settled — the date
  // of the payment leg that zeroed the balance (or the anchor date for a manual
  // correction to zero) — not the wall-clock time of this recompute, since
  // payments can be backdated or edited long after they landed.
  if (account.currentBalance.isNegative() && !newCurrentBalance.isNegative()) {
    const paidOffEvent: LoanEvent = {
      type: 'paid_off',
      at: resolveSettledAt({ anchorBalanceCents: account.initialBalance.toCents(), anchorDate, legs }),
    };
    await loanDetails.update({ events: [...events, paidOffEvent] });
  }

  // Rebuild the loan's Balances history off the base-currency (ref) anchor
  // snapshot: one row on the anchor date (same-day payments fold in — the anchor
  // boundary is inclusive) plus one cumulative row per later day with legs.
  // Balances rows are unique per (accountId, date). Loans opt out of the
  // per-transaction Balances cascade, so this rebuild is the loan's only history
  // writer; pre-anchor rows stay untouched. Balances.amount stores the ref balance.
  const rebuiltRows = replayLoanOutstanding({
    legs,
    anchorDate,
    openingBalance: account.refInitialBalance,
    pickCents: ({ leg }) => leg.refAmount.toCents(),
  }).map((row) => ({ date: new Date(row.date), refBalance: row.balance }));

  // Clear the range first so removed/moved payments leave no ghost rows; the
  // account-creation row falls inside it and is re-written by the anchor row.
  await Balances.destroy({
    where: { accountId: loanAccountId, date: { [Op.gte]: anchorDate } },
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
