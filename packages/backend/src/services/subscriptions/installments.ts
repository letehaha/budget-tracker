import { SUBSCRIPTION_PERIOD_STATUSES, SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { ValidationError } from '@js/errors';
import SubscriptionPeriods from '@models/subscription-periods.model';
import Subscriptions from '@models/subscriptions.model';
import { Op } from 'sequelize';

/**
 * Guards the installment invariant: a finite plan must carry a payment count
 * (`maxOccurrences`) and a schedule date (`dueDate`). Throwing in the service layer
 * gives every caller a clean validation error — including the MCP tools, which call
 * the services directly and bypass the controllers' request-schema check — instead of
 * letting the `chk_subscriptions_installment_requires_schedule` DB constraint surface
 * a raw error. Pass the post-change ("merged") values when validating an update.
 */
export function assertInstallmentScheduleComplete({
  type,
  maxOccurrences,
  dueDate,
}: {
  type: SUBSCRIPTION_TYPES;
  maxOccurrences: number | null | undefined;
  dueDate: string | null | undefined;
}): void {
  if (type === SUBSCRIPTION_TYPES.installment && (maxOccurrences == null || dueDate == null)) {
    throw new ValidationError({
      message: 'Installments require a payment count (maxOccurrences) and a schedule date (dueDate).',
    });
  }
}

/**
 * Rejects lowering a payment count below what the schedule has already consumed
 * (paid + skipped periods). Those periods are immutable history — a plan can't
 * truthfully become "2 payments" once 3 have been made or skipped — so the edit
 * is refused rather than silently leaving `paidPeriodsCount > maxOccurrences`.
 *
 * Lives in the service layer so MCP callers (which bypass the controller schema)
 * are covered too. `null` (uncapped) and a count at/above the consumed total are
 * allowed. Pass the post-change ("merged") maxOccurrences.
 */
export async function assertMaxOccurrencesNotBelowConsumed({
  subscriptionId,
  maxOccurrences,
}: {
  subscriptionId: string;
  maxOccurrences: number | null | undefined;
}): Promise<void> {
  if (maxOccurrences == null) return;

  const consumedCount = await SubscriptionPeriods.count({
    where: {
      subscriptionId,
      status: { [Op.in]: [SUBSCRIPTION_PERIOD_STATUSES.paid, SUBSCRIPTION_PERIOD_STATUSES.skipped] },
    },
  });

  if (maxOccurrences < consumedCount) {
    throw new ValidationError({
      message: `Cannot reduce the payment count to ${maxOccurrences}: ${consumedCount} payment(s) have already been made or skipped.`,
    });
  }
}

/**
 * Decides whether a recurring subscription has consumed its installment allowance.
 *
 * The schedule is capped by `maxOccurrences`: once the subscription has accumulated
 * that many periods of ANY status (upcoming, paid, or skipped), no further period is
 * generated. A skipped period still counts toward the cap so skipping does not extend
 * the schedule — this is intentional and predictable.
 *
 * Reaching the cap ONLY stops period generation here; this predicate never mutates the
 * subscription. Completion of an `installment` (deactivate + stamp `completedAt`) is a
 * separate step handled by `finalizeInstallmentCompletion`.
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

/**
 * Marks an installment finished once its schedule is fully consumed: stamps
 * `completedAt` and deactivates it so it drops out of the active lists. Call this only
 * when the cap has already been reached (no more periods to generate).
 *
 * `completedAt` — not `isActive` alone — is the source of truth for "finished": a
 * manually paused installment also carries `isActive = false`, so `completedAt` is what
 * tells the two apart and what `revertPeriod` clears to reopen a finished installment.
 *
 * Idempotent: re-running on an already-finished installment preserves the original
 * `completedAt` (never re-stamps it). It still re-asserts `isActive = false` so a plan
 * that was reactivated (e.g. toggled active while still cap-reached) and then
 * reconciled is left correctly finished rather than active-yet-complete.
 *
 * No-op for subscriptions and bills (only installments complete) and for an installment
 * already finished and inactive.
 */
export async function finalizeInstallmentCompletion({ subscription }: { subscription: Subscriptions }): Promise<void> {
  if (subscription.type !== SUBSCRIPTION_TYPES.installment) return;
  if (subscription.completedAt != null && !subscription.isActive) return;

  await subscription.update({ isActive: false, completedAt: subscription.completedAt ?? new Date() });
}
