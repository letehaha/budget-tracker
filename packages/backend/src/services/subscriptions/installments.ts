import SubscriptionPeriods from '@models/subscription-periods.model';
import Subscriptions from '@models/subscriptions.model';

/**
 * Decides whether a recurring subscription has consumed its installment allowance.
 *
 * The schedule is capped by `maxOccurrences`: once the subscription has accumulated
 * that many periods of ANY status (upcoming, paid, or skipped), no further period is
 * generated. A skipped period still counts toward the cap so skipping does not extend
 * the schedule — this is intentional and predictable.
 *
 * Reaching the cap ONLY stops period generation. It does NOT set `isActive = false`
 * because `isActive` is the user's manual pause/resume toggle on subscriptions; the
 * two concepts must remain independent.
 *
 * `null` maxOccurrences means repeat indefinitely — returns false immediately.
 *
 * Returns `true` when the cap is reached, meaning the caller must NOT create another
 * period.
 */
export async function isSubscriptionInstallmentCapReached({
  subscription,
}: {
  subscription: Subscriptions;
}): Promise<boolean> {
  if (subscription.maxOccurrences == null) return false;

  const existingCount = await SubscriptionPeriods.count({
    where: { subscriptionId: subscription.id },
  });

  return existingCount >= subscription.maxOccurrences;
}
