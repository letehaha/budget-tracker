import type { LoanApi } from '@/api/loans';
import { useDateLocale } from '@/composable/use-date-locale';
import { parseISO } from 'date-fns';
import { type MaybeRefOrGetter, computed, toValue } from 'vue';

/**
 * Shared projection display formatting so the list card and detail projection card render the same
 * clamped progress width and null-to-em-dash rules.
 */
export function useLoanProjectionDisplay({
  loan,
  payoffDateFormat,
}: {
  loan: MaybeRefOrGetter<LoanApi>;
  /** date-fns format string — consumers differ in verbosity (e.g. 'MMM yyyy' vs 'MMM d, yyyy'). */
  payoffDateFormat: string;
}) {
  const { format: formatDate } = useDateLocale();

  const projection = computed(() => toValue(loan).projection);

  const progressBarWidth = computed(() => Math.min(100, Math.max(0, projection.value.paidToDatePercent)));

  const monthsRemainingDisplay = computed(() => {
    const months = projection.value.monthsRemaining;
    if (months === null) return '—';
    return String(months);
  });

  const payoffDateDisplay = computed(() => {
    const date = projection.value.payoffDate;
    if (!date) return '—';
    return formatDate(parseISO(date), payoffDateFormat);
  });

  return { progressBarWidth, monthsRemainingDisplay, payoffDateDisplay };
}
