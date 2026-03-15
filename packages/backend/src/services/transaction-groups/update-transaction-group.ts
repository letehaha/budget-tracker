import { NotFoundError } from '@js/errors';
import TransactionGroups from '@models/transaction-groups.model';
import { withTransaction } from '@services/common/with-transaction';

interface UpdateTransactionGroupPayload {
  id: number;
  userId: number;
  name?: string;
  note?: string | null;
}

export const updateTransactionGroup = withTransaction(async (payload: UpdateTransactionGroupPayload) => {
  const { id, userId, name, note } = payload;

  const group = await TransactionGroups.findOne({
    where: { id, userId },
  });

  if (!group) {
    throw new NotFoundError({ message: 'Transaction group not found.' });
  }

  await group.update({
    ...(name !== undefined && { name }),
    ...(note !== undefined && { note }),
  });

  return group;
});
