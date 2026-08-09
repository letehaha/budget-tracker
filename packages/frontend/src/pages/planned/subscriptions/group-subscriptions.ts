import type { SubscriptionListItem } from '@/api/subscriptions';
import { isSameMonth, parseISO } from 'date-fns';

import { daysUntilDue, isSubscriptionOverdue } from './subscription-due-status';
import { SUBSCRIPTION_SORT_KEYS, type SubscriptionSortKey } from './utils';

export const SUBSCRIPTION_GROUP_KEYS = {
  overdue: 'overdue',
  dueSoon: 'dueSoon',
  thisMonth: 'thisMonth',
  later: 'later',
  noSchedule: 'noSchedule',
  active: 'active',
  paused: 'paused',
} as const;

export type SubscriptionGroupKey = (typeof SUBSCRIPTION_GROUP_KEYS)[keyof typeof SUBSCRIPTION_GROUP_KEYS];

export interface SubscriptionGroup {
  key: SubscriptionGroupKey;
  labelKey: string;
  items: SubscriptionListItem[];
}

const DUE_SOON_MAX_DAYS = 7;

const GROUP_LABEL_KEYS: Record<SubscriptionGroupKey, string> = {
  [SUBSCRIPTION_GROUP_KEYS.overdue]: 'planned.subscriptions.groups.overdue',
  [SUBSCRIPTION_GROUP_KEYS.dueSoon]: 'planned.subscriptions.groups.dueSoon',
  [SUBSCRIPTION_GROUP_KEYS.thisMonth]: 'planned.subscriptions.groups.thisMonth',
  [SUBSCRIPTION_GROUP_KEYS.later]: 'planned.subscriptions.groups.later',
  [SUBSCRIPTION_GROUP_KEYS.noSchedule]: 'planned.subscriptions.groups.noSchedule',
  [SUBSCRIPTION_GROUP_KEYS.active]: 'planned.subscriptions.groups.active',
  [SUBSCRIPTION_GROUP_KEYS.paused]: 'planned.subscriptions.groups.paused',
};

const DUE_DATE_GROUP_ORDER: SubscriptionGroupKey[] = [
  SUBSCRIPTION_GROUP_KEYS.overdue,
  SUBSCRIPTION_GROUP_KEYS.dueSoon,
  SUBSCRIPTION_GROUP_KEYS.thisMonth,
  SUBSCRIPTION_GROUP_KEYS.later,
  SUBSCRIPTION_GROUP_KEYS.noSchedule,
  SUBSCRIPTION_GROUP_KEYS.paused,
];

const FLAT_GROUP_ORDER: SubscriptionGroupKey[] = [SUBSCRIPTION_GROUP_KEYS.active, SUBSCRIPTION_GROUP_KEYS.paused];

const dueDateGroupKey = ({
  subscription,
  now,
}: {
  subscription: SubscriptionListItem;
  now: Date;
}): SubscriptionGroupKey => {
  if (isSubscriptionOverdue({ subscription, now })) return SUBSCRIPTION_GROUP_KEYS.overdue;
  if (!subscription.nextDueDate) return SUBSCRIPTION_GROUP_KEYS.noSchedule;

  const days = daysUntilDue({ dueDate: subscription.nextDueDate, now });
  if (days === null) return SUBSCRIPTION_GROUP_KEYS.noSchedule;
  if (days <= DUE_SOON_MAX_DAYS) return SUBSCRIPTION_GROUP_KEYS.dueSoon;
  if (isSameMonth(parseISO(subscription.nextDueDate), now)) return SUBSCRIPTION_GROUP_KEYS.thisMonth;
  return SUBSCRIPTION_GROUP_KEYS.later;
};

const groupKeyFor = ({
  subscription,
  sortBy,
  now,
}: {
  subscription: SubscriptionListItem;
  sortBy: SubscriptionSortKey;
  now: Date;
}): SubscriptionGroupKey => {
  if (!subscription.isActive) return SUBSCRIPTION_GROUP_KEYS.paused;
  if (sortBy !== SUBSCRIPTION_SORT_KEYS.dueDate) return SUBSCRIPTION_GROUP_KEYS.active;
  return dueDateGroupKey({ subscription, now });
};

export const groupSubscriptions = ({
  subscriptions,
  sortBy,
  now,
}: {
  subscriptions: SubscriptionListItem[];
  sortBy: SubscriptionSortKey;
  now: Date;
}): SubscriptionGroup[] => {
  const order = sortBy === SUBSCRIPTION_SORT_KEYS.dueDate ? DUE_DATE_GROUP_ORDER : FLAT_GROUP_ORDER;

  return order
    .map((key) => ({
      key,
      labelKey: GROUP_LABEL_KEYS[key],
      items: subscriptions.filter((subscription) => groupKeyFor({ subscription, sortBy, now }) === key),
    }))
    .filter((group) => group.items.length > 0);
};
