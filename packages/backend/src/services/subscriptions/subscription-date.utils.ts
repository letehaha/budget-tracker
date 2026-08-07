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

  const txDates = (transactions ?? [])
    .map((tx) => (tx.time ? new Date(tx.time) : null))
    .filter((d): d is Date => d !== null);

  // A start date that hasn't arrived yet is itself the next payment, so nothing is advanced.
  if (txDates.length === 0 && toUtcDay({ date: start }) >= toUtcDay({ date: now })) {
    return toUtcDay({ date: start });
  }

  // Advance from the latest known payment by frequency until we get a future date
  let next = addFrequency({ date: txDates.length > 0 ? max(txDates) : start, frequency });

  while (next < now) {
    next = addFrequency({ date: next, frequency });
  }

  return toUtcDay({ date: next });
};

const toUtcDay = ({ date }: { date: Date }): string => date.toISOString().split('T')[0]!;

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
