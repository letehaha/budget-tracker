import { withTransaction } from '@services/common/with-transaction';

import { findSubscriptionOrThrow } from './helpers';

export const toggleSubscriptionActive = withTransaction(
  async ({ id, userId, isActive }: { id: string; userId: number; isActive: boolean }) => {
    const subscription = await findSubscriptionOrThrow({ id, userId });

    // Reactivating a finished installment clears its completion so `isActive` and
    // `completedAt` never contradict (a finished installment carries isActive=false +
    // completedAt set). Besides revertPeriod, this is the only path that reopens one.
    const fields = isActive && subscription.completedAt != null ? { isActive, completedAt: null } : { isActive };
    await subscription.update(fields);

    return subscription.toJSON();
  },
);
