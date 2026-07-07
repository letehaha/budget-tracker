import { describe, expect, it } from 'vitest';

import { DEFAULT_SUBSCRIPTION_SORT, SUBSCRIPTION_SORT_KEYS, isSubscriptionSortKey } from './utils';

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
