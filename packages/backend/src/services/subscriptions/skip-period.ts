import { SUBSCRIPTION_PERIOD_STATUSES } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { ConflictError } from '@js/errors';
import SubscriptionPeriods from '@models/subscription-periods.model';
import { withTransaction } from '@services/common/with-transaction';

import { ensureNextPeriodExists } from './ensure-next-period';
import { findSubscriptionOrThrow } from './helpers';

interface SkipPeriodParams {
  userId: number;
  subscriptionId: string;
  periodId: string;
}

export const skipPeriod = withTransaction(async ({ userId, subscriptionId, periodId }: SkipPeriodParams) => {
  const subscription = await findSubscriptionOrThrow({ id: subscriptionId, userId });

  const period = await findOrThrowNotFound({
    query: SubscriptionPeriods.findOne({
      where: { id: periodId, subscriptionId },
    }),
    message: 'Subscription period not found.',
  });

  if (period.status === SUBSCRIPTION_PERIOD_STATUSES.paid) {
    throw new ConflictError({ message: 'Cannot skip a paid period — revert it first.' });
  }

  if (period.status === SUBSCRIPTION_PERIOD_STATUSES.skipped) {
    throw new ConflictError({ message: 'This period is already skipped.' });
  }

  await period.update({
    status: SUBSCRIPTION_PERIOD_STATUSES.skipped,
  });

  // Ensure the next upcoming period exists so the schedule doesn't stall after a skip.
  await ensureNextPeriodExists({ subscription });

  return period.reload();
});
