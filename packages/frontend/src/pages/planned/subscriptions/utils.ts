import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_TYPES, TRANSACTION_TYPES } from '@bt/shared/types';
import type { ComposerTranslation } from 'vue-i18n';

/** Sentinel for "no type filter" in the list page tabs and the summary card. */
export const ALL_TYPES_FILTER = 'all' as const;

export type SubscriptionTypeFilter = SUBSCRIPTION_TYPES | typeof ALL_TYPES_FILTER;

export const isSubscriptionTypeFilter = (value: unknown): value is SubscriptionTypeFilter =>
  value === ALL_TYPES_FILTER || Object.values(SUBSCRIPTION_TYPES).includes(value as SUBSCRIPTION_TYPES);

export const formatFrequency = ({
  frequency,
  t,
}: {
  frequency: SUBSCRIPTION_FREQUENCIES;
  t: ComposerTranslation;
}): string => {
  const map: Record<SUBSCRIPTION_FREQUENCIES, string> = {
    [SUBSCRIPTION_FREQUENCIES.weekly]: t('planned.subscriptions.frequency.weekly'),
    [SUBSCRIPTION_FREQUENCIES.biweekly]: t('planned.subscriptions.frequency.biweekly'),
    [SUBSCRIPTION_FREQUENCIES.monthly]: t('planned.subscriptions.frequency.monthly'),
    [SUBSCRIPTION_FREQUENCIES.quarterly]: t('planned.subscriptions.frequency.quarterly'),
    [SUBSCRIPTION_FREQUENCIES.semiAnnual]: t('planned.subscriptions.frequency.semiAnnual'),
    [SUBSCRIPTION_FREQUENCIES.annual]: t('planned.subscriptions.frequency.annual'),
  };
  return map[frequency] || frequency;
};

export const SUBSCRIPTION_SORT_KEYS = {
  dueDate: 'dueDate',
  amount: 'amount',
  name: 'name',
  recent: 'recent',
} as const;

export type SubscriptionSortKey = (typeof SUBSCRIPTION_SORT_KEYS)[keyof typeof SUBSCRIPTION_SORT_KEYS];

export const DEFAULT_SUBSCRIPTION_SORT: SubscriptionSortKey = SUBSCRIPTION_SORT_KEYS.dueDate;

/** localStorage key persisting the user's chosen sort across sessions. */
export const SUBSCRIPTION_SORT_STORAGE_KEY = 'planned.subscriptions.sortBy';

export const isSubscriptionSortKey = (value: unknown): value is SubscriptionSortKey =>
  typeof value === 'string' && Object.values(SUBSCRIPTION_SORT_KEYS).includes(value as SubscriptionSortKey);

export const getTransactionTypeStyles = (
  transactionType: string | undefined,
  fallbackClass: string = 'text-foreground',
): string => {
  return transactionType === TRANSACTION_TYPES.income ? 'text-app-income-color font-medium' : fallbackClass;
};

export const getTransactionTypePrefix = (transactionType: string | undefined): string => {
  return transactionType === TRANSACTION_TYPES.income ? '+' : '';
};

/**
 * Per-type thresholds for highlighting how heavy the recurring cost is relative to income.
 * Subscriptions (entertainment-ish) should fire alarms much earlier than bills (rent/utilities).
 */
const PERCENT_OF_INCOME_THRESHOLDS: Record<SubscriptionTypeFilter, { yellow: number; red: number }> = {
  [SUBSCRIPTION_TYPES.subscription]: { yellow: 5, red: 10 },
  [SUBSCRIPTION_TYPES.bill]: { yellow: 30, red: 50 },
  [SUBSCRIPTION_TYPES.installment]: { yellow: 30, red: 50 },
  [ALL_TYPES_FILTER]: { yellow: 20, red: 40 },
};

export const getPercentOfIncomeColorClass = ({
  percent,
  type,
}: {
  percent: number | null | undefined;
  type?: SubscriptionTypeFilter;
}): string => {
  if (percent === null || percent === undefined) return 'text-muted-foreground';
  const { yellow, red } = PERCENT_OF_INCOME_THRESHOLDS[type ?? ALL_TYPES_FILTER];
  if (percent >= red) return 'text-app-expense-color';
  if (percent >= yellow) return 'text-warning-text';
  return 'text-app-income-color';
};
