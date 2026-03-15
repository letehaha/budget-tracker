import { NotFoundError } from '@js/errors';
import TransactionGroups from '@models/transaction-groups.model';
import { withTransaction } from '@services/common/with-transaction';

interface DeleteTransactionGroupPayload {
  id: number;
  userId: number;
}

export const deleteTransactionGroup = withTransaction(async ({ id, userId }: DeleteTransactionGroupPayload) => {
  const group = await TransactionGroups.findOne({
    where: { id, userId },
  });

  if (!group) {
    throw new NotFoundError({ message: 'Transaction group not found.' });
  }

  // CASCADE on TransactionGroupItems will clean up join rows
  await group.destroy();

  return { success: true };
});
