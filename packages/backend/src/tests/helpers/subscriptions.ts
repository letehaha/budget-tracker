import { SUBSCRIPTION_FREQUENCIES, SUBSCRIPTION_TYPES, SubscriptionModel, TransactionModel } from '@bt/shared/types';
import type { createSubscription as apiCreateSubscription } from '@services/subscriptions/create-subscription';
import type { getSubscriptions as apiGetSubscriptions } from '@services/subscriptions/get-subscriptions';
import type { getSubscriptionsSummary as apiGetSubscriptionsSummary } from '@services/subscriptions/get-subscriptions-summary';
import type { linkTransactionsToSubscription as apiLinkTransactions } from '@services/subscriptions/link-transactions';
import type { suggestHistoricalMatches as apiSuggestMatches } from '@services/subscriptions/suggest-historical-matches';
import type { unlinkTransactionsFromSubscription as apiUnlinkTransactions } from '@services/subscriptions/unlink-transactions';

import { makeRequest } from './common';

interface CreateSubscriptionPayload {
  name: string;
  type?: SUBSCRIPTION_TYPES;
  expectedAmount?: number | null;
  expectedCurrencyCode?: string | null;
  frequency: SUBSCRIPTION_FREQUENCIES;
  startDate: string;
  endDate?: string | null;
  accountId?: number | null;
  categoryId?: number | null;
  matchingRules?: { rules: Array<Record<string, unknown>> };
  notes?: string | null;
}

interface UpdateSubscriptionPayload {
  name?: string;
  type?: SUBSCRIPTION_TYPES;
  expectedAmount?: number | null;
  expectedCurrencyCode?: string | null;
  frequency?: SUBSCRIPTION_FREQUENCIES;
  startDate?: string;
  endDate?: string | null;
  accountId?: number | null;
  categoryId?: number | null;
  matchingRules?: { rules: Array<Record<string, unknown>> };
  notes?: string | null;
}

export async function createSubscription<R extends boolean | undefined = undefined>({
  raw,
  ...payload
}: CreateSubscriptionPayload & { raw?: R }) {
  return makeRequest<Awaited<ReturnType<typeof apiCreateSubscription>>, R>({
    method: 'post',
    url: '/subscriptions',
    payload,
    raw,
  });
}

export async function getSubscriptions<R extends boolean | undefined = undefined>({
  raw,
  isActive,
  type,
}: {
  raw?: R;
  isActive?: boolean;
  type?: string;
} = {}) {
  const query: Record<string, string> = {};
  if (isActive !== undefined) query.isActive = String(isActive);
  if (type) query.type = type;

  return makeRequest<Awaited<ReturnType<typeof apiGetSubscriptions>>, R>({
    method: 'get',
    url: '/subscriptions',
    payload: query,
    raw,
  });
}

export async function getSubscriptionById<R extends boolean | undefined = undefined>({
  id,
  raw,
}: {
  id: string;
  raw?: R;
}) {
  return makeRequest<SubscriptionModel & { transactions: TransactionModel[]; nextExpectedDate: string | null }, R>({
    method: 'get',
    url: `/subscriptions/${id}`,
    raw,
  });
}

export async function updateSubscription<R extends boolean | undefined = undefined>({
  id,
  raw,
  ...payload
}: UpdateSubscriptionPayload & { id: string; raw?: R }) {
  return makeRequest<SubscriptionModel, R>({
    method: 'put',
    url: `/subscriptions/${id}`,
    payload,
    raw,
  });
}

export async function deleteSubscription<R extends boolean | undefined = undefined>({
  id,
  raw,
}: {
  id: string;
  raw?: R;
}) {
  return makeRequest<{ success: boolean }, R>({
    method: 'delete',
    url: `/subscriptions/${id}`,
    raw,
  });
}

export async function toggleSubscriptionActive<R extends boolean | undefined = undefined>({
  id,
  isActive,
  raw,
}: {
  id: string;
  isActive: boolean;
  raw?: R;
}) {
  return makeRequest<SubscriptionModel, R>({
    method: 'patch',
    url: `/subscriptions/${id}/toggle-active`,
    payload: { isActive },
    raw,
  });
}

export async function linkTransactionsToSubscription<R extends boolean | undefined = undefined>({
  id,
  transactionIds,
  raw,
}: {
  id: string;
  transactionIds: number[];
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof apiLinkTransactions>>, R>({
    method: 'post',
    url: `/subscriptions/${id}/transactions`,
    payload: { transactionIds },
    raw,
  });
}

export async function unlinkTransactionsFromSubscription<R extends boolean | undefined = undefined>({
  id,
  transactionIds,
  raw,
}: {
  id: string;
  transactionIds: number[];
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof apiUnlinkTransactions>>, R>({
    method: 'delete',
    url: `/subscriptions/${id}/transactions`,
    payload: { transactionIds },
    raw,
  });
}

export async function getSuggestedMatches<R extends boolean | undefined = undefined>({
  id,
  raw,
}: {
  id: string;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof apiSuggestMatches>>, R>({
    method: 'get',
    url: `/subscriptions/${id}/suggest-matches`,
    raw,
  });
}

export async function getSubscriptionsSummary<R extends boolean | undefined = undefined>({
  raw,
  type,
}: {
  raw?: R;
  type?: string;
} = {}) {
  const query: Record<string, string> = {};
  if (type) query.type = type;

  return makeRequest<Awaited<ReturnType<typeof apiGetSubscriptionsSummary>>, R>({
    method: 'get',
    url: '/subscriptions/summary',
    payload: Object.keys(query).length ? query : undefined,
    raw,
  });
}
