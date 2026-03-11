import { NotFoundError } from '@js/errors';
import TransactionGroups from '@models/TransactionGroups.model';

import { INCLUDE_GROUP_TRANSACTIONS } from './constants';

interface GetTransactionGroupByIdPayload {
  id: number;
  userId: number;
}

export const getTransactionGroupById = async ({ id, userId }: GetTransactionGroupByIdPayload) => {
  const group = await TransactionGroups.findOne({
    where: { id, userId },
    include: [INCLUDE_GROUP_TRANSACTIONS],
  });

  if (!group) {
    throw new NotFoundError({ message: 'Transaction group not found.' });
  }

  // Sort transactions by time DESC in JS to avoid Sequelize ordering issues with BelongsToMany
  if (group.transactions) {
    group.transactions.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }

  return group;
};
