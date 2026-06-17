import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import type { PaymentReminderPeriodModel, PaymentReminderStatus } from '@bt/shared/types';
import { PAYMENT_REMINDER_STATUSES } from '@bt/shared/types';
import type { QueryClient } from '@tanstack/vue-query';
import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns';

const FREQUENCY_KEY_MAP: Record<string, string> = {
  weekly: 'planned.reminders.frequencies.weekly',
  biweekly: 'planned.reminders.frequencies.biweekly',
  monthly: 'planned.reminders.frequencies.monthly',
  quarterly: 'planned.reminders.frequencies.quarterly',
  semi_annual: 'planned.reminders.frequencies.semiAnnual',
  annual: 'planned.reminders.frequencies.annual',
};

export function getFrequencyI18nKey({ freq }: { freq: string | null }): string {
  if (!freq) return 'planned.reminders.frequencies.oneTime';
  return FREQUENCY_KEY_MAP[freq] ?? freq;
}

export function invalidateReminderQueries({ queryClient }: { queryClient: QueryClient }) {
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.remindersList });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.reminderDetails });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.reminderPeriods });
  // Marking a period paid can book an expense transaction, so refresh everything
  // keyed off transaction changes (account balances, records, dashboard widgets).
  queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });
}

export function getDaysUntilDue({ dueDate }: { dueDate: string }): number {
  return differenceInCalendarDays(parseISO(dueDate), startOfDay(new Date()));
}

const ACTIONABLE_STATUSES: ReadonlySet<PaymentReminderStatus> = new Set([
  PAYMENT_REMINDER_STATUSES.upcoming,
  PAYMENT_REMINDER_STATUSES.overdue,
]);

const REVERTABLE_STATUSES: ReadonlySet<PaymentReminderStatus> = new Set([
  PAYMENT_REMINDER_STATUSES.paid,
  PAYMENT_REMINDER_STATUSES.skipped,
]);

export function isStatusActionable({ status }: { status: string }): boolean {
  return ACTIONABLE_STATUSES.has(status as PaymentReminderStatus);
}

/**
 * Maps each period to its 1-based installment number ("Payment X of N").
 *
 * The periods endpoint returns a `dueDate DESC` slice that always starts at
 * offset 0 (the newest period), with `total` reporting the full count. So a
 * period at DESC index `i` is chronologically the `(total - i)`-th occurrence —
 * exact even while only a partial (paginated) window is loaded.
 */
export function buildInstallmentNumbers({
  periodsDesc,
  total,
}: {
  periodsDesc: PaymentReminderPeriodModel[];
  total: number;
}): Record<string, number> {
  const result: Record<string, number> = {};
  periodsDesc.forEach((period, index) => {
    result[period.id] = total - index;
  });
  return result;
}

export function isStatusRevertable({ status }: { status: string }): boolean {
  return REVERTABLE_STATUSES.has(status as PaymentReminderStatus);
}
