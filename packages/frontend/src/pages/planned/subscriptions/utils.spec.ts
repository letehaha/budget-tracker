import { SUBSCRIPTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import {
  ALL_TYPES_FILTER,
  DEFAULT_SUBSCRIPTION_SORT,
  SUBSCRIPTION_SORT_KEYS,
  getPercentOfIncomeColorClass,
  isSubscriptionSortKey,
} from './utils';

describe('isSubscriptionSortKey', () => {
  it('accepts every known sort key', () => {
    for (const key of Object.values(SUBSCRIPTION_SORT_KEYS)) {
      expect(isSubscriptionSortKey(key)).toBe(true);
    }
  });

  it('rejects unknown strings', () => {
    expect(isSubscriptionSortKey('createdAt')).toBe(false);
    expect(isSubscriptionSortKey('')).toBe(false);
    expect(isSubscriptionSortKey('DueDate')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isSubscriptionSortKey(null)).toBe(false);
    expect(isSubscriptionSortKey(undefined)).toBe(false);
    expect(isSubscriptionSortKey(0)).toBe(false);
    expect(isSubscriptionSortKey({})).toBe(false);
  });
});

describe('DEFAULT_SUBSCRIPTION_SORT', () => {
  it('is a valid sort key', () => {
    expect(isSubscriptionSortKey(DEFAULT_SUBSCRIPTION_SORT)).toBe(true);
  });
});

describe('getPercentOfIncomeColorClass', () => {
  it('is muted when the percent is unknown', () => {
    expect(getPercentOfIncomeColorClass({ percent: null })).toBe('text-muted-foreground');
    expect(getPercentOfIncomeColorClass({ percent: undefined })).toBe('text-muted-foreground');
  });

  it('escalates through income, warning and expense colors as the share grows', () => {
    expect(getPercentOfIncomeColorClass({ percent: 19 })).toBe('text-app-income-color');
    expect(getPercentOfIncomeColorClass({ percent: 20 })).toBe('text-warning-text');
    expect(getPercentOfIncomeColorClass({ percent: 40 })).toBe('text-app-expense-color');
  });

  it('defaults to the all-types thresholds when no type is given', () => {
    expect(getPercentOfIncomeColorClass({ percent: 25 })).toBe(
      getPercentOfIncomeColorClass({ percent: 25, type: ALL_TYPES_FILTER }),
    );
  });

  it('alarms much earlier for subscriptions than for bills', () => {
    expect(getPercentOfIncomeColorClass({ percent: 10, type: SUBSCRIPTION_TYPES.subscription })).toBe(
      'text-app-expense-color',
    );
    expect(getPercentOfIncomeColorClass({ percent: 10, type: SUBSCRIPTION_TYPES.bill })).toBe('text-app-income-color');
    expect(getPercentOfIncomeColorClass({ percent: 30, type: SUBSCRIPTION_TYPES.bill })).toBe('text-warning-text');
    expect(getPercentOfIncomeColorClass({ percent: 50, type: SUBSCRIPTION_TYPES.bill })).toBe('text-app-expense-color');
  });
});
