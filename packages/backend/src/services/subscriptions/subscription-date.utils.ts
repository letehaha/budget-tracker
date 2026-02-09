import { SUBSCRIPTION_FREQUENCIES } from '@bt/shared/types';
import { addMonths, addWeeks, addYears, max, parseISO } from 'date-fns';

export const computeNextExpectedDate = ({
  startDate,
  frequency,
  transactions,
}: {
  startDate: string;
  frequency: SUBSCRIPTION_FREQUENCIES;
  transactions?: Array<{ time?: Date | string }>;
}): string | null => {
  const start = parseISO(startDate);
  const now = new Date();

  // Find the latest linked transaction date
  let lastDate = start;
  if (transactions && transactions.length > 0) {
    const txDates = transactions.map((tx) => (tx.time ? new Date(tx.time) : null)).filter((d): d is Date => d !== null);

    if (txDates.length > 0) {
      lastDate = max(txDates);
    }
  }

  // Advance from lastDate by frequency until we get a future date
  let next = addFrequency({ date: lastDate, frequency });

  // If the computed next date is still in the past, keep advancing
  while (next < now) {
    next = addFrequency({ date: next, frequency });
  }

  return next.toISOString().split('T')[0]!;
};

const addFrequency = ({ date, frequency }: { date: Date; frequency: SUBSCRIPTION_FREQUENCIES }): Date => {
  switch (frequency) {
    case SUBSCRIPTION_FREQUENCIES.weekly:
      return addWeeks(date, 1);
    case SUBSCRIPTION_FREQUENCIES.biweekly:
      return addWeeks(date, 2);
    case SUBSCRIPTION_FREQUENCIES.monthly:
      return addMonths(date, 1);
    case SUBSCRIPTION_FREQUENCIES.quarterly:
      return addMonths(date, 3);
    case SUBSCRIPTION_FREQUENCIES.semiAnnual:
      return addMonths(date, 6);
    case SUBSCRIPTION_FREQUENCIES.annual:
      return addYears(date, 1);
    default:
      return addMonths(date, 1);
  }
};
