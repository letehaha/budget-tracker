import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import type { PaymentReminderStatus } from '@bt/shared/types';
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

export function isStatusRevertable({ status }: { status: string }): boolean {
  return REVERTABLE_STATUSES.has(status as PaymentReminderStatus);
}
