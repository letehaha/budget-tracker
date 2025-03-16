import { NotFoundError } from '@js/errors';
import { logger } from '@js/utils/logger';
import * as RefundTransactions from '@models/RefundTransactions.model';
import * as Transactions from '@models/Transactions.model';
import { Op } from 'sequelize';

import { withTransaction } from '../common/with-transaction';

interface RemoveRefundLinkParams {
  userId: number;
  originalTxId: number | null;
  refundTxId: number;
}

export const removeRefundLink = withTransaction(
  async ({ userId, originalTxId, refundTxId }: RemoveRefundLinkParams): Promise<void> => {
    try {
      // Fetch the refund link
      const refundLink = await RefundTransactions.default.findOne({
        where: {
          originalTxId,
          refundTxId,
          userId,
        },
      });

      if (!refundLink) {
        throw new NotFoundError({
          message: 'Refund link not found',
        });
      }

      // Remove the refund link
      await refundLink.destroy();

      await Transactions.updateTransactions(
        { refundLinked: false },
        { userId, id: { [Op.in]: [originalTxId, refundTxId].filter(Boolean) } },
        { individualHooks: false },
      );

      logger.info(`Refund link between transactions ${originalTxId} and ${refundTxId} removed successfully`);
    } catch (e) {
      if (process.env.NODE_ENV !== 'test') {
        logger.error({ message: 'Error removing refund link:', error: e as Error });
      }
      throw e;
    }
  },
);
