import { SUBSCRIPTION_PERIOD_STATUSES } from '@bt/shared/types';
import SubscriptionPeriods from '@models/subscription-periods.model';
import Subscriptions from '@models/subscriptions.model';

import { calculateNextDueDate } from './calculate-next-due-date';
import { finalizeInstallmentCompletion, isSubscriptionInstallmentCapReached } from './installments';
import { resolveOpenPeriodStatus } from './resolve-period-status';

/**
 * After a period is marked paid or skipped, ensures the next upcoming period
 * exists. If an upcoming period already exists (e.g. from a previous create
 * cycle), it is left untouched. Returns immediately when the installment cap
 * has been consumed.
 */
export async function ensureNextPeriodExists({ subscription }: { subscription: Subscriptions }) {
  const upcomingPeriod = await SubscriptionPeriods.findOne({
    where: {
      subscriptionId: subscription.id,
      status: SUBSCRIPTION_PERIOD_STATUSES.upcoming,
    },
  });

  if (upcomingPeriod) return;

  // Stop generating once the schedule is fully consumed. For an installment that
  // also means the plan is finished, so finalize it (deactivate + stamp completedAt);
  // for subscriptions/bills this is a no-op and isActive is left to the user's toggle.
  if (await isSubscriptionInstallmentCapReached({ subscription })) {
    await finalizeInstallmentCompletion({ subscription });
    return;
  }

  const latestPeriod = await SubscriptionPeriods.findOne({
    where: { subscriptionId: subscription.id },
    order: [['dueDate', 'DESC']],
  });

  if (!latestPeriod) return;

  // anchorDay is derived from the initial dueDate when the subscription was
  // created. A latestPeriod only exists when dueDate was set, so anchorDay is
  // non-null here. Fall back to the latest period's own day-of-month if somehow
  // null (defensive only, not a reachable state in normal flow).
  const anchorDay = subscription.anchorDay ?? new Date(latestPeriod.dueDate + 'T00:00:00Z').getUTCDate();

  const nextDueDate = calculateNextDueDate({
    currentDueDate: latestPeriod.dueDate,
    frequency: subscription.frequency,
    anchorDay,
  });

  await SubscriptionPeriods.create({
    subscriptionId: subscription.id,
    dueDate: nextDueDate,
    status: resolveOpenPeriodStatus({ dueDate: nextDueDate }),
  });
}
