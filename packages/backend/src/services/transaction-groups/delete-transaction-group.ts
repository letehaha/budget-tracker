import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import TransactionGroups from '@models/TransactionGroups.model';
import { withTransaction } from '@services/common/with-transaction';

interface DeleteTransactionGroupPayload {
  id: number;
  userId: number;
}

export const deleteTransactionGroup = withTransaction(async ({ id, userId }: DeleteTransactionGroupPayload) => {
  const group = await findOrThrowNotFound({
    query: TransactionGroups.findOne({
      where: { id, userId },
    }),
    message: 'Transaction group not found.',
  });

  // CASCADE on TransactionGroupItems will clean up join rows
  await group.destroy();

  return { success: true };
});
