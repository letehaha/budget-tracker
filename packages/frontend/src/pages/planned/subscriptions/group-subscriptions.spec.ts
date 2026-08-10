import type { SubscriptionListItem } from '@/api/subscriptions';
import { type RecordId, SUBSCRIPTION_PERIOD_STATUSES } from '@bt/shared/types';
import { addDays, format } from 'date-fns';
import { describe, expect, it } from 'vitest';

import {
  SUBSCRIPTION_GROUP_KEYS,
  type SubscriptionGroup,
  type SubscriptionGroupKey,
  groupSubscriptions,
} from './group-subscriptions';
import { buildSubscription } from './subscription-fixtures';
import { SUBSCRIPTION_SORT_KEYS, type SubscriptionSortKey } from './utils';

const NOW = new Date(2025, 5, 15, 13, 30);

const dateInDays = (days: number): string => format(addDays(NOW, days), 'yyyy-MM-dd');

const makeItem = ({
  id,
  dueInDays,
  rawDueDate,
  isActive = true,
  periodStatus,
}: {
  id: string;
  dueInDays?: number;
  rawDueDate?: string;
  isActive?: boolean;
  periodStatus?: SUBSCRIPTION_PERIOD_STATUSES;
}): SubscriptionListItem => {
  const nextDueDate = rawDueDate ?? (dueInDays === undefined ? null : dateInDays(dueInDays));
  return buildSubscription({
    id: id as RecordId,
    name: id,
    isActive,
    nextDueDate,
    currentPeriod:
      periodStatus && nextDueDate ? { id: `${id}-period`, dueDate: nextDueDate, status: periodStatus } : null,
  });
};

/** Every input lands in exactly one group — catches both drops and duplicates. */
const expectItemsConserved = ({
  groups,
  subscriptions,
}: {
  groups: SubscriptionGroup[];
  subscriptions: SubscriptionListItem[];
}): void => {
  const grouped = groups.flatMap((group) => group.items);
  expect(grouped).toHaveLength(subscriptions.length);
  expect(new Set(grouped.map((item) => item.id)).size).toBe(subscriptions.length);
};

const group = ({
  subscriptions,
  sortBy = SUBSCRIPTION_SORT_KEYS.dueDate,
  now = NOW,
}: {
  subscriptions: SubscriptionListItem[];
  sortBy?: SubscriptionSortKey;
  now?: Date;
}): SubscriptionGroup[] => {
  const groups = groupSubscriptions({ subscriptions, sortBy, now });
  expectItemsConserved({ groups, subscriptions });
  return groups;
};

const groupKeysOf = (subscriptions: SubscriptionListItem[]): SubscriptionGroupKey[] =>
  group({ subscriptions }).map((entry) => entry.key);

const groupIdsOf = (groups: SubscriptionGroup[]): { key: SubscriptionGroupKey; ids: string[] }[] =>
  groups.map((entry) => ({ key: entry.key, ids: entry.items.map((item) => item.id) }));

describe('groupSubscriptions', () => {
  describe('due-date buckets', () => {
    it.each([
      { dueInDays: -1, expected: SUBSCRIPTION_GROUP_KEYS.overdue },
      { dueInDays: 0, expected: SUBSCRIPTION_GROUP_KEYS.dueSoon },
      { dueInDays: 7, expected: SUBSCRIPTION_GROUP_KEYS.dueSoon },
      { dueInDays: 8, expected: SUBSCRIPTION_GROUP_KEYS.thisMonth },
      { dueInDays: 15, expected: SUBSCRIPTION_GROUP_KEYS.thisMonth },
      { dueInDays: 16, expected: SUBSCRIPTION_GROUP_KEYS.later },
      { dueInDays: 40, expected: SUBSCRIPTION_GROUP_KEYS.later },
    ])('puts an item due in $dueInDays days into $expected', ({ dueInDays, expected }) => {
      expect(groupKeysOf([makeItem({ id: 'a', dueInDays })])).toEqual([expected]);
    });

    it.each([
      {
        label: 'next month but within a week',
        now: new Date(2025, 0, 28),
        dueDate: '2025-02-02',
        expected: SUBSCRIPTION_GROUP_KEYS.dueSoon,
      },
      {
        label: 'same month beyond a week',
        now: new Date(2025, 0, 5),
        dueDate: '2025-01-25',
        expected: SUBSCRIPTION_GROUP_KEYS.thisMonth,
      },
      {
        label: 'next month beyond a week',
        now: new Date(2025, 0, 5),
        dueDate: '2025-02-03',
        expected: SUBSCRIPTION_GROUP_KEYS.later,
      },
      {
        label: 'last day of the current month',
        now: new Date(2025, 0, 5),
        dueDate: '2025-01-31',
        expected: SUBSCRIPTION_GROUP_KEYS.thisMonth,
      },
      {
        label: 'same month next year',
        now: new Date(2025, 0, 5),
        dueDate: '2026-01-20',
        expected: SUBSCRIPTION_GROUP_KEYS.later,
      },
    ])('buckets $label as $expected', ({ now, dueDate, expected }) => {
      const groups = group({ subscriptions: [makeItem({ id: 'a', rawDueDate: dueDate })], now });
      expect(groups.map((entry) => entry.key)).toEqual([expected]);
    });

    it('treats a future item with a stored overdue period as overdue', () => {
      expect(
        groupKeysOf([makeItem({ id: 'a', dueInDays: 5, periodStatus: SUBSCRIPTION_PERIOD_STATUSES.overdue })]),
      ).toEqual([SUBSCRIPTION_GROUP_KEYS.overdue]);
    });

    it('treats a past due date as overdue even when the stored period is still upcoming', () => {
      expect(
        groupKeysOf([makeItem({ id: 'a', dueInDays: -3, periodStatus: SUBSCRIPTION_PERIOD_STATUSES.upcoming })]),
      ).toEqual([SUBSCRIPTION_GROUP_KEYS.overdue]);
    });

    it('puts an active item without a due date into noSchedule', () => {
      expect(groupKeysOf([makeItem({ id: 'a' })])).toEqual([SUBSCRIPTION_GROUP_KEYS.noSchedule]);
    });

    it('puts an item with an unparseable due date into noSchedule', () => {
      expect(groupKeysOf([makeItem({ id: 'a', rawDueDate: 'not-a-date' })])).toEqual([
        SUBSCRIPTION_GROUP_KEYS.noSchedule,
      ]);
    });

    it('keeps an unparseable due date out of the date buckets when mixed with valid items', () => {
      const subscriptions = [
        makeItem({ id: 'broken', rawDueDate: '2025-99-99' }),
        makeItem({ id: 'dueSoon', dueInDays: 2 }),
      ];

      expect(groupIdsOf(group({ subscriptions }))).toEqual([
        { key: SUBSCRIPTION_GROUP_KEYS.dueSoon, ids: ['dueSoon'] },
        { key: SUBSCRIPTION_GROUP_KEYS.noSchedule, ids: ['broken'] },
      ]);
    });

    it('puts an inactive item into paused even when its due date is in the past', () => {
      expect(groupKeysOf([makeItem({ id: 'a', dueInDays: -10, isActive: false })])).toEqual([
        SUBSCRIPTION_GROUP_KEYS.paused,
      ]);
    });

    it('returns groups in a stable order regardless of input order', () => {
      const subscriptions = [
        makeItem({ id: 'paused', dueInDays: 2, isActive: false }),
        makeItem({ id: 'later', dueInDays: 40 }),
        makeItem({ id: 'noSchedule' }),
        makeItem({ id: 'overdue', dueInDays: -2 }),
        makeItem({ id: 'thisMonth', dueInDays: 10 }),
        makeItem({ id: 'dueSoon', dueInDays: 1 }),
      ];

      expect(groupKeysOf(subscriptions)).toEqual([
        SUBSCRIPTION_GROUP_KEYS.overdue,
        SUBSCRIPTION_GROUP_KEYS.dueSoon,
        SUBSCRIPTION_GROUP_KEYS.thisMonth,
        SUBSCRIPTION_GROUP_KEYS.later,
        SUBSCRIPTION_GROUP_KEYS.noSchedule,
        SUBSCRIPTION_GROUP_KEYS.paused,
      ]);
    });

    it('preserves the incoming order of items within a group', () => {
      const subscriptions = [
        makeItem({ id: 'c', dueInDays: 7 }),
        makeItem({ id: 'a', dueInDays: 1 }),
        makeItem({ id: 'b', dueInDays: 3 }),
      ];

      expect(groupIdsOf(group({ subscriptions }))).toEqual([
        { key: SUBSCRIPTION_GROUP_KEYS.dueSoon, ids: ['c', 'a', 'b'] },
      ]);
    });

    it('omits empty groups', () => {
      expect(groupKeysOf([makeItem({ id: 'a', dueInDays: 3 })])).toEqual([SUBSCRIPTION_GROUP_KEYS.dueSoon]);
    });
  });

  describe('group labels', () => {
    it('carries the full i18n key for each rendered group', () => {
      const subscriptions = [
        makeItem({ id: 'dueSoon', dueInDays: 1 }),
        makeItem({ id: 'paused', dueInDays: 1, isActive: false }),
      ];

      expect(group({ subscriptions }).map((entry) => entry.labelKey)).toEqual([
        'planned.subscriptions.groups.dueSoon',
        'planned.subscriptions.groups.paused',
      ]);
    });

    it('labels the flat active group', () => {
      expect(
        group({ subscriptions: [makeItem({ id: 'a' })], sortBy: SUBSCRIPTION_SORT_KEYS.name }).map(
          (entry) => entry.labelKey,
        ),
      ).toEqual(['planned.subscriptions.groups.active']);
    });
  });

  describe('non due-date sorts', () => {
    it('returns a flat active/paused split preserving the server order', () => {
      const subscriptions = [
        makeItem({ id: 'a', dueInDays: -5 }),
        makeItem({ id: 'b', dueInDays: 40, isActive: false }),
        makeItem({ id: 'c' }),
      ];

      expect(groupIdsOf(group({ subscriptions, sortBy: SUBSCRIPTION_SORT_KEYS.amount }))).toEqual([
        { key: SUBSCRIPTION_GROUP_KEYS.active, ids: ['a', 'c'] },
        { key: SUBSCRIPTION_GROUP_KEYS.paused, ids: ['b'] },
      ]);
    });

    it('returns only the active group when nothing is paused', () => {
      expect(
        group({ subscriptions: [makeItem({ id: 'a', dueInDays: 2 })], sortBy: SUBSCRIPTION_SORT_KEYS.name }).map(
          (entry) => entry.key,
        ),
      ).toEqual([SUBSCRIPTION_GROUP_KEYS.active]);
    });
  });

  it('returns no groups for an empty list', () => {
    expect(group({ subscriptions: [], sortBy: SUBSCRIPTION_SORT_KEYS.dueDate })).toEqual([]);
    expect(group({ subscriptions: [], sortBy: SUBSCRIPTION_SORT_KEYS.recent })).toEqual([]);
  });
});
