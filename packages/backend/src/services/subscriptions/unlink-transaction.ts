import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import SubscriptionPeriods from '@models/subscription-periods.model';
import { withTransaction } from '@services/common/with-transaction';

import { findSubscriptionOrThrow } from './helpers';

interface UnlinkTransactionParams {
  userId: number;
  subscriptionId: string;
  periodId: string;
}

export const unlinkTransaction = withTransaction(
  async ({ userId, subscriptionId, periodId }: UnlinkTransactionParams) => {
    await findSubscriptionOrThrow({ id: subscriptionId, userId });

    const period = await findOrThrowNotFound({
      query: SubscriptionPeriods.findOne({
        where: { id: periodId, subscriptionId },
      }),
      message: 'Subscription period not found.',
    });

    // Detaching is the user explicitly severing the link, so the transaction stays.
    // Clearing transactionAutoCreated keeps the flag honest: with no linked tx there
    // is nothing for revert to delete.
    await period.update({ transactionId: null, transactionAutoCreated: false });

    return period.reload();
  },
);
