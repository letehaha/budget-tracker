import { SUBSCRIPTION_FREQUENCIES } from '@bt/shared/types';

import { computeNextExpectedDate } from './subscription-date.utils';

export type SubscriptionSortBy = 'dueDate' | 'amount' | 'name' | 'recent';

/**
 * The effective next-due date for a list item, computed for EVERY subscription
 * so the UI can always render "in N days" and sort on a single field.
 *
 * Prefers the earliest open period's `dueDate` (period-payments engine). Falls
 * back to the derived date for detection-only subscriptions that have no open
 * period, anchoring the derivation on the latest linked active transaction time
 * (or `startDate` when there are none). Returns null only when uncomputable.
 */
export const computeEffectiveNextDueDate = ({
  earliestPeriodDueDate,
  startDate,
  frequency,
  latestTransactionTime,
}: {
  earliestPeriodDueDate: string | null;
  startDate: string;
  frequency: SUBSCRIPTION_FREQUENCIES;
  latestTransactionTime: Date | string | null;
}): string | null => {
  if (earliestPeriodDueDate) return earliestPeriodDueDate;

  return computeNextExpectedDate({
    startDate,
    frequency,
    transactions: latestTransactionTime ? [{ time: latestTransactionTime }] : [],
  });
};

interface SortableSubscription {
  name: string;
  /** Effective next-due date as a YYYY-MM-DD string; null sorts last. */
  nextDueDate: string | null;
  /** Expected charge as a decimal number; null sorts last. */
  expectedAmount: number | null;
  createdAt: Date | string;
}

/** Case-insensitive name tie-breaker shared by the date/amount comparators. */
const compareName = (a: SortableSubscription, b: SortableSubscription): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/**
 * Pure, in-memory sort of the assembled list (there is no pagination).
 *
 * - `dueDate`: `nextDueDate` ascending, nulls last, name tie-break. ISO date
 *   strings compare chronologically, so overdue (past) dates float to the top.
 * - `amount`: `expectedAmount` descending, nulls last, name tie-break.
 * - `name`: name ascending, case-insensitive.
 * - `recent`: `createdAt` descending (the previous default order).
 */
export const sortSubscriptions = <T extends SortableSubscription>({
  items,
  sortBy,
}: {
  items: T[];
  sortBy: SubscriptionSortBy;
}): T[] => {
  const sorted = [...items];

  switch (sortBy) {
    case 'dueDate':
      sorted.sort((a, b) => {
        if (a.nextDueDate === null && b.nextDueDate === null) return compareName(a, b);
        if (a.nextDueDate === null) return 1;
        if (b.nextDueDate === null) return -1;
        const cmp = a.nextDueDate.localeCompare(b.nextDueDate);
        return cmp !== 0 ? cmp : compareName(a, b);
      });
      break;
    case 'amount':
      sorted.sort((a, b) => {
        if (a.expectedAmount === null && b.expectedAmount === null) return compareName(a, b);
        if (a.expectedAmount === null) return 1;
        if (b.expectedAmount === null) return -1;
        const cmp = b.expectedAmount - a.expectedAmount;
        return cmp !== 0 ? cmp : compareName(a, b);
      });
      break;
    case 'name':
      sorted.sort(compareName);
      break;
    case 'recent':
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      break;
  }

  return sorted;
};
