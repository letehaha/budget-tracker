import { withTransaction } from '@services/common/with-transaction';

import { findSubscriptionOrThrow } from './helpers';

export const deleteSubscription = withTransaction(async ({ id, userId }: { id: string; userId: number }) => {
  const subscription = await findSubscriptionOrThrow({ id, userId });

  await subscription.destroy();

  return { success: true };
});
