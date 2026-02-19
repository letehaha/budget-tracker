import { TRANSACTION_TYPES } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import * as RefundTransactions from '@models/RefundTransactions.model';
import * as Transactions from '@models/Transactions.model';
import type { WhereOptions } from 'sequelize';

interface FiltersStructure {
  categoryId?: number;
  transactionType?: TRANSACTION_TYPES;
  accountId?: number;
}

export interface GetRefundTransactionsParams extends FiltersStructure {
  userId: number;
  page?: number;
  limit?: number;
}

export const getRefundTransactions = async ({
  userId,
  categoryId,
  transactionType,
  accountId,
  page = 1,
  limit = 2,
}: GetRefundTransactionsParams): Promise<{
  rows: RefundTransactions.default[];
  meta: { total: number; page: number; limit: number };
}> => {
  try {
    const transactionWhereClause: WhereOptions<FiltersStructure> = {};

    if (categoryId) {
      transactionWhereClause.categoryId = categoryId;
    }

    if (transactionType) {
      transactionWhereClause.transactionType = transactionType;
    }

    if (accountId) {
      transactionWhereClause.accountId = accountId;
    }

    const { rows, count: total } = await RefundTransactions.default.findAndCountAll({
      where: {
        userId,
      },
      include: [
        {
          model: Transactions.default,
          as: 'originalTransaction',
          where: transactionWhereClause,
        },
        {
          model: Transactions.default,
          as: 'refundTransaction',
        },
      ],
      limit,
      offset: (page - 1) * limit,
    });

    return { rows, meta: { total, page, limit } };
  } catch (e) {
    logger.error({ message: 'Error retrieving refund transactions:', error: e as Error });
    throw e;
  }
};
