import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import * as Transactions from '@models/transactions.model';
import { withTransaction } from '@root/services/common/with-transaction';
import { Op } from '@sequelize/core';
import { assertTxWriteAccess } from '@services/sharing/auth/authorize-account-write.service';

export const unlinkTransferTransactions = withTransaction(
  async (payload: { userId: number; transferIds: string[] }): Promise<Transactions.default[]> => {
    try {
      // Fetch all rows for the given transferIds without a userId filter — both sides of a
      // shared-account transfer can belong to different users. The per-tx auth gate below
      // verifies the caller has `write` on each side's parent account before mutating.
      const transactions = await Transactions.default.findAll({
        where: { transferId: { [Op.in]: payload.transferIds } },
      });

      for (const tx of transactions) {
        await assertTxWriteAccess({
          userId: payload.userId,
          tx,
          notFoundKey: 'transactions.linkCannotFind',
        });
      }

      const txIds = transactions.map((tx) => tx.id);
      await Transactions.default.update(
        {
          transferId: null,
          transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
        },
        {
          where: {
            id: { [Op.in]: txIds },
          },
        },
      );

      const updatedTxs = await Transactions.default.findAll({
        where: { id: { [Op.in]: txIds } },
      });

      return updatedTxs;
    } catch (err) {
      logger.error(err as Error);
      throw err;
    }
  },
);
