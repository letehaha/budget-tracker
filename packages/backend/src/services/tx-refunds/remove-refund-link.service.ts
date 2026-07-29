import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { logger } from '@js/utils/logger';
import * as RefundTransactions from '@models/refund-transactions.model';

import { withTransaction } from '../common/with-transaction';
import { syncRefundLinkedFlags } from './sync-refund-linked-flags';

interface RemoveRefundLinkParams {
  userId: number;
  originalTxId: string | null;
  refundTxId: string;
}

export const removeRefundLink = withTransaction(
  async ({ userId, originalTxId, refundTxId }: RemoveRefundLinkParams): Promise<void> => {
    try {
      // Fetch the refund link
      const refundLink = await findOrThrowNotFound({
        query: RefundTransactions.default.findOne({
          where: {
            originalTxId,
            refundTxId,
            userId,
          },
        }),
        message: 'Refund link not found',
      });

      // Remove the refund link
      await refundLink.destroy();

      // Recompute rather than clear: the original may still hold other partial refunds.
      await syncRefundLinkedFlags({ transactionIds: [originalTxId, refundTxId] });

      logger.info(`Refund link between transactions ${originalTxId} and ${refundTxId} removed successfully`);
    } catch (e) {
      if (process.env.NODE_ENV !== 'test') {
        logger.error({ message: 'Error removing refund link:', error: e as Error });
      }
      throw e;
    }
  },
);
