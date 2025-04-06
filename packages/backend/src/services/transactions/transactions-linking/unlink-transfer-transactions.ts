import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import * as Transactions from '@models/Transactions.model';
import { withTransaction } from '@root/services/common/with-transaction';
import { Op } from 'sequelize';

export const unlinkTransferTransactions = withTransaction(
  async (payload: { userId: number; transferIds: string[] }): Promise<Transactions.default[]> => {
    try {
      const transactions = await Transactions.getTransactionsByArrayOfField({
        userId: payload.userId,
        fieldName: 'transferId',
        fieldValues: payload.transferIds,
      });

      const txIds = transactions.map((t) => t.id);
      await Transactions.default.update(
        {
          transferId: null,
          transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
        },
        {
          where: {
            userId: payload.userId,
            id: { [Op.in]: txIds },
          },
        },
      );

      const updatedTxs = await Transactions.getTransactionsByArrayOfField({
        userId: payload.userId,
        fieldName: 'id',
        fieldValues: txIds,
      });

      return updatedTxs;
    } catch (err) {
      logger.error(err as Error);
      throw err;
    }
  },
);
