import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import Transactions from '@models/transactions.model';
import { Op, col, fn, where as sqlWhere } from 'sequelize';

/**
 * Payment legs that count toward a loan's outstanding balance: the
 * `transfer_to_loan` income legs on the loan account dated on/after the anchor
 * date (inclusive `DATE(time) >= anchorDate` — the anchor snapshot is the
 * outstanding *before* that day's payments, so same-day legs still count).
 * Pre-anchor legs are baked into the snapshot and stay informational.
 *
 * Single home for this query so the balance recompute
 * (`recompute-loan-balance.service`) and the correction overpay guard
 * (`update-loan.service`) can never drift on which legs count.
 */
export const getPostAnchorPaymentLegs = async ({
  loanAccountId,
  userId,
  anchorDate,
}: {
  loanAccountId: string;
  userId: number;
  /** yyyy-MM-dd inclusive boundary. */
  anchorDate: string;
}): Promise<Transactions[]> =>
  Transactions.findAll({
    where: {
      accountId: loanAccountId,
      userId,
      transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
      // A loan account only ever holds the income legs of its payments; pinning
      // the type keeps a stray non-income leg from flipping the sign of the sum.
      transactionType: TRANSACTION_TYPES.income,
      [Op.and]: [sqlWhere(fn('DATE', col('time')), Op.gte, anchorDate)],
    },
  });
