import { SUBSCRIPTION_PERIOD_STATUSES, type SubscriptionPeriodStatus } from '@bt/shared/types';

/**
 * Status a freshly opened period should carry given its due date: `overdue` when
 * the due day has already passed, otherwise `upcoming`.
 *
 * Mirrors the daily `markOverduePeriods` cron (`dueDate < today`) so a period
 * created with a due date already in the past is born `overdue` instead of
 * sitting as `upcoming` — showing "in -1 days" — until the next cron tick.
 *
 * `dueDate` is a DATEONLY 'YYYY-MM-DD' string; lexicographic `<` is chronological
 * for that format, and the due day itself still counts as not-yet-overdue.
 */
export function resolveOpenPeriodStatus({ dueDate }: { dueDate: string }): SubscriptionPeriodStatus {
  const today = new Date().toISOString().split('T')[0]!;
  return dueDate < today ? SUBSCRIPTION_PERIOD_STATUSES.overdue : SUBSCRIPTION_PERIOD_STATUSES.upcoming;
}
