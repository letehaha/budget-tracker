import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import TransactionGroups from '@models/transaction-groups.model';

import { INCLUDE_GROUP_TRANSACTIONS } from './constants';

interface GetTransactionGroupByIdPayload {
  id: number;
  userId: number;
}

export const getTransactionGroupById = async ({ id, userId }: GetTransactionGroupByIdPayload) => {
  const group = await findOrThrowNotFound({
    query: TransactionGroups.findOne({
      where: { id, userId },
      include: [INCLUDE_GROUP_TRANSACTIONS],
    }),
    message: 'Transaction group not found.',
  });

  // Sort transactions by time DESC in JS to avoid Sequelize ordering issues with BelongsToMany
  if (group.transactions) {
    group.transactions.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }

  return group;
};
