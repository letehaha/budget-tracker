import { ACCOUNT_TYPES, TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import RefundTransactions from '@models/RefundTransactions.model';
import * as Transactions from '@models/Transactions.model';
import { Op } from 'sequelize';

import { withTransaction } from '../common/with-transaction';
import { getTransactionById } from './get-by-id';

export const deleteTransaction = withTransaction(
  async ({ id, userId }: { id: number; userId: number }): Promise<void> => {
    try {
      const result = await getTransactionById({
        id,
        userId,
      });

      if (!result) return undefined;

      const { accountType, transferNature, transferId, refundLinked } = result;

      if (accountType !== ACCOUNT_TYPES.system) {
        throw new ValidationError({
          message: "It's not allowed to manually delete external transactions",
        });
      }

      if (refundLinked) {
        await unlinkRefundTransaction(id);
      }

      if (transferNature === TRANSACTION_TRANSFER_NATURE.not_transfer) {
        await Transactions.deleteTransactionById({ id, userId });
      } else if (transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer && transferId) {
        const transferTransactions = await Transactions.getTransactionsByArrayOfField({
          fieldValues: [transferId],
          fieldName: 'transferId',
          userId,
        });

        await Promise.all(
          // For the each transaction with the same "transferId" delete transaction
          transferTransactions.map((tx) =>
            Promise.all([
              Transactions.deleteTransactionById({
                id: tx.id,
                userId: tx.userId,
              }),
            ]),
          ),
        );
      } else {
        logger.info('No "transferId" exists for the transfer transaction type.');
      }
    } catch (e) {
      if (process.env.NODE_ENV !== 'test') {
        logger.error(e as Error);
      }
      throw e;
    }
  },
);

const unlinkRefundTransaction = withTransaction(async (id: number) => {
  const refundTx = await RefundTransactions.findOne({
    where: {
      [Op.or]: [{ originalTxId: id }, { refundTxId: id }],
    },
  });

  if (!refundTx) return undefined;

  const transactionIdsToUpdate = [refundTx.refundTxId, refundTx.originalTxId].filter((i) => Boolean(i) && i !== id);

  if (transactionIdsToUpdate.length) {
    await Transactions.default.update(
      { refundLinked: false },
      {
        where: {
          id: {
            [Op.in]: transactionIdsToUpdate,
          },
        },
      },
    );
  }
});
