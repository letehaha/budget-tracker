import { ACCOUNT_CATEGORIES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import Balances from '@models/balances.model';
import LoanDetails from '@models/loan-details.model';
import Transactions from '@models/transactions.model';
import { withTransaction } from '@services/common/with-transaction';
import { startOfDay } from 'date-fns';
import { Op, fn, col, where as sqlWhere } from 'sequelize';

/**
 * Recompute a loan account's authoritative balance from its anchor snapshot
 * plus the payment legs recorded after the anchor date. A loan's balance is
 * NOT maintained incrementally (unlike ordinary accounts): the opening
 * outstanding is asserted as-of `balanceAnchorDate`, so `transfer_to_loan` legs
 * dated on or after the anchor adjust it while legs dated before the anchor are
 * already baked into the snapshot and stay informational. This is what lets a
 * user create a loan today and have a payment recorded the same day reduce the
 * balance, while back-tagging an older transaction does not. Idempotent; a no-op
 * for non-loan accounts.
 */
const recomputeLoanBalanceImpl = async ({ loanAccountId }: { loanAccountId: string }): Promise<void> => {
  const account = await Accounts.findOne({ where: { id: loanAccountId } });
  if (!account || account.accountCategory !== ACCOUNT_CATEGORIES.loan) return;

  const loanDetails = await LoanDetails.findOne({
    where: { accountId: loanAccountId },
    attributes: ['balanceAnchorDate'],
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

  const legs = await Transactions.findAll({
    where: {
      accountId: loanAccountId,
      transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
      // A loan account only ever holds the income legs of its payments; pinning
      // the type keeps a stray non-income leg from flipping the sign of the sum.
      transactionType: TRANSACTION_TYPES.income,
      // DATE(time) on or after the anchor day. The snapshot already accounts for
      // every payment dated before the anchor, so only payments from the anchor
      // date onward adjust the outstanding.
      [Op.and]: [sqlWhere(fn('DATE', col('time')), Op.gte, anchorDate)],
    },
  });

  // Income legs move a negative liability balance toward zero, so they add.
  let sumCents = 0;
  let sumRefCents = 0;
  for (const leg of legs) {
    sumCents += leg.amount.toCents();
    sumRefCents += leg.refAmount.toCents();
  }

  const newCurrentBalance = account.initialBalance.add(Money.fromCents(sumCents));
  const newRefCurrentBalance = account.refInitialBalance.add(Money.fromCents(sumRefCents));

  if (!newCurrentBalance.equals(account.currentBalance) || !newRefCurrentBalance.equals(account.refCurrentBalance)) {
    await Accounts.update(
      { currentBalance: newCurrentBalance, refCurrentBalance: newRefCurrentBalance },
      { where: { id: loanAccountId } },
    );
  }

  // Reflect the recomputed balance in today's history row (absolute upsert on
  // (accountId, date)); the per-tx incremental history cascade is disabled for
  // loans, so this is the loan's only Balances writer.
  await Balances.updateAccountBalance({
    accountId: loanAccountId,
    date: startOfDay(new Date()),
    refBalance: newRefCurrentBalance,
  });
};

export const recomputeLoanBalance = withTransaction(recomputeLoanBalanceImpl);
