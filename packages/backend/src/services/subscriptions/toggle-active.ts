import { SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { withTransaction } from '@services/common/with-transaction';

import { reconcileInstallmentCompletion } from './ensure-next-period';
import { findSubscriptionOrThrow } from './helpers';

export const toggleSubscriptionActive = withTransaction(
  async ({ id, userId, isActive }: { id: string; userId: number; isActive: boolean }) => {
    const subscription = await findSubscriptionOrThrow({ id, userId });

    await subscription.update({ isActive });

    // Reactivating an installment must reconcile its completion rather than just
    // flip the flag: if the cap is still consumed it re-finalizes (so we never
    // leave an active, cap-reached installment with completedAt cleared and no open
    // period — a zombie); if room remains it clears the completion and regenerates
    // the next period. Besides revertPeriod, this is the only path that reopens one.
    if (isActive && subscription.type === SUBSCRIPTION_TYPES.installment) {
      await reconcileInstallmentCompletion({ subscription });
    }

    return subscription.toJSON();
  },
);
