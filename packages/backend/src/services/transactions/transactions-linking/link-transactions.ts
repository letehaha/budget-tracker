import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { t } from '@i18n/index';
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
      message: t({ key: 'transactions.linkSelfNotAllowed' }),
    });
  }
  if (opposite.transactionType === base.transactionType) {
    throw new ValidationError({
      message: t({ key: 'transactions.linkSameTypeNotAllowed' }),
    });
  }
  if (opposite.accountId === base.accountId) {
    throw new ValidationError({
      message: t({ key: 'transactions.linkSameAccountNotAllowed' }),
    });
  }
  if (
    opposite.transferNature !== TRANSACTION_TRANSFER_NATURE.not_transfer ||
    (!ignoreBaseTxTypeValidation && base.transferNature !== TRANSACTION_TRANSFER_NATURE.not_transfer)
  ) {
    // TODO: disabled when multiple links are available
    throw new ValidationError({
      message: t({ key: 'transactions.linkAlreadyTransferNotAllowed' }),
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
            message: t({ key: 'transactions.linkUnexpectedError' }),
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
            message: t({ key: 'transactions.linkCannotFind' }),
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
