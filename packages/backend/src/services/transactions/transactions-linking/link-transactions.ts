import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import * as Transactions from '@models/Transactions.model';
import { withTransaction } from '@root/services/common/with-transaction';
import { Op } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';

const validateTransactionLinking = ({
  base,
  opposite,
  ignoreBaseTxTypeValidation,
}: {
  base: Transactions.default;
  opposite: Transactions.default;
  ignoreBaseTxTypeValidation?: boolean;
}) => {
  if (base.id === opposite.id) {
    throw new ValidationError({
      message: 'Trying to link the transaction to itself.',
    });
  }
  if (opposite.transactionType === base.transactionType) {
    throw new ValidationError({
      message: 'Trying to link with the transaction that has the same "transactionType".',
    });
  }
  if (opposite.accountId === base.accountId) {
    throw new ValidationError({
      message:
        "Trying to link with the transaction within the same account. It's allowed to link only between different accounts",
    });
  }
  if (
    opposite.transferNature !== TRANSACTION_TRANSFER_NATURE.not_transfer ||
    (!ignoreBaseTxTypeValidation && base.transferNature !== TRANSACTION_TRANSFER_NATURE.not_transfer)
  ) {
    // TODO: disabled when multiple links are available
    throw new ValidationError({
      message: 'Trying to link transaction that is already a transfer.',
    });
  }
};

type ResultStruct = [baseTx: Transactions.default, oppositeTx: Transactions.default];
export const linkTransactions = withTransaction(
  async ({
    userId,
    ids,
    ignoreBaseTxTypeValidation,
  }: {
    userId: number;
    ids: [baseTxId: number, oppositeTxId: number][];
    ignoreBaseTxTypeValidation?: boolean;
  }): Promise<[baseTx: Transactions.default, oppositeTx: Transactions.default][]> => {
    try {
      const result: ResultStruct[] = [];

      for (const [baseTxId, oppositeTxId] of ids) {
        const transactions = await Transactions.getTransactionsByArrayOfField({
          userId,
          fieldName: 'id',
          fieldValues: [baseTxId, oppositeTxId],
        });

        if (transactions.length !== 2) {
          throw new ValidationError({
            message: 'Unexpected error. Cannot link asked transactions.',
          });
        }

        const base = transactions.find((tx) => tx.id === baseTxId);
        const opposite = transactions.find((tx) => tx.id === oppositeTxId);

        if (!base || !opposite) {
          logger.info('Cannot find base or opposite transactions', {
            base,
            opposite,
          });
          throw new ValidationError({
            message: 'Cannot find base or opposite transactions',
          });
        }

        validateTransactionLinking({
          base,
          opposite,
          ignoreBaseTxTypeValidation,
        });

        const [, results] = await Transactions.default.update(
          {
            transferId: uuidv4(),
            transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          },
          {
            where: {
              userId,
              id: { [Op.in]: [baseTxId, oppositeTxId] },
            },
            returning: true,
          },
        );

        result.push([
          results.find((tx) => tx.id === baseTxId),
          results.find((tx) => tx.id === oppositeTxId),
        ] as ResultStruct);
      }

      return result;
    } catch (err) {
      logger.error(err as Error);
      throw err;
    }
  },
);
