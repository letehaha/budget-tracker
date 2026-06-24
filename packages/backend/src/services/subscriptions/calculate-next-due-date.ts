import { SUBSCRIPTION_FREQUENCIES } from '@bt/shared/types';
import { addDays, addMonths, getDaysInMonth } from 'date-fns';

interface CalculateNextDueDateParams {
  currentDueDate: string;
  frequency: SUBSCRIPTION_FREQUENCIES;
  anchorDay: number;
}

/**
 * Calculates the next due date based on frequency and anchor day.
 * Handles month-end clamping: if anchor is 31 but month only has 28 days,
 * clamps to 28. When a month with 31 days comes back, returns to 31.
 */
export function calculateNextDueDate({ currentDueDate, frequency, anchorDay }: CalculateNextDueDateParams): string {
  const current = new Date(currentDueDate + 'T00:00:00Z');

  switch (frequency) {
    case SUBSCRIPTION_FREQUENCIES.weekly:
      return formatDate(addDays(current, 7));

    case SUBSCRIPTION_FREQUENCIES.biweekly:
      return formatDate(addDays(current, 14));

    case SUBSCRIPTION_FREQUENCIES.monthly:
      return clampToAnchor({ date: addMonths(current, 1), anchorDay });

    case SUBSCRIPTION_FREQUENCIES.quarterly:
      return clampToAnchor({ date: addMonths(current, 3), anchorDay });

    case SUBSCRIPTION_FREQUENCIES.semiAnnual:
      return clampToAnchor({ date: addMonths(current, 6), anchorDay });

    case SUBSCRIPTION_FREQUENCIES.annual:
      return clampToAnchor({ date: addMonths(current, 12), anchorDay });

    default:
      throw new Error(`Unknown frequency: ${frequency}`);
  }
}

function clampToAnchor({ date, anchorDay }: { date: Date; anchorDay: number }): string {
  const daysInMonth = getDaysInMonth(date);
  const day = Math.min(anchorDay, daysInMonth);
  const clamped = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), day));
  return formatDate(clamped);
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]!;
}
