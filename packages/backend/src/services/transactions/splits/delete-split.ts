import { t } from '@i18n/index';
import { NotFoundError, ValidationError } from '@js/errors';
import RefundTransactions from '@models/RefundTransactions.model';
import * as TransactionSplits from '@models/TransactionSplits.model';

import { withTransaction } from '../../common/with-transaction';

interface DeleteSplitParams {
  splitId: string;
  userId: number;
}

/**
 * Deletes a single split from a transaction.
 * The split's amount will be returned to the primary category.
 *
 * Rules:
 * 1. Split must exist and belong to the user
 * 2. Split cannot be deleted if it has refunds targeting it
 */
export const deleteSplit = withTransaction(async ({ splitId, userId }: DeleteSplitParams) => {
  const split = await TransactionSplits.getSplitById({ id: splitId, userId });

  if (!split) {
    throw new NotFoundError({
      message: t({ key: 'transactions.splits.splitNotFound' }),
    });
  }

  // Check if any refunds target this split
  const refundTargetingSplit = await RefundTransactions.findOne({
    where: { splitId, userId },
  });

  if (refundTargetingSplit) {
    throw new ValidationError({
      message: t({ key: 'transactions.splits.cannotDeleteWithRefunds' }),
    });
  }

  await TransactionSplits.deleteSplitById({ id: splitId, userId });

  return { deleted: true };
});
