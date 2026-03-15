import { withTransaction } from '@services/common/with-transaction';

import { findSubscriptionOrThrow } from './helpers';

export const toggleSubscriptionActive = withTransaction(
  async ({ id, userId, isActive }: { id: string; userId: number; isActive: boolean }) => {
    const subscription = await findSubscriptionOrThrow({ id, userId });

    await subscription.update({ isActive });

    return subscription.toJSON();
  },
);
