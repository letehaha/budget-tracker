import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import type { QueryClient } from '@tanstack/vue-query';
import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns';

export function formatFrequency({ freq }: { freq: string | null }): string {
  if (!freq) return 'One-time';
  const map: Record<string, string> = {
    weekly: 'Weekly',
    biweekly: 'Every 2 weeks',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    semi_annual: 'Every 6 months',
    annual: 'Annual',
  };
  return map[freq] ?? freq;
}

export function invalidateReminderQueries({ queryClient }: { queryClient: QueryClient }) {
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.remindersList });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.reminderDetails });
  queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.reminderPeriods });
}

export function getDaysUntilDue({ dueDate }: { dueDate: string }): number {
  return differenceInCalendarDays(parseISO(dueDate), startOfDay(new Date()));
}
