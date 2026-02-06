import { api } from '@/api/_api';
import { SubscriptionModel, TransactionModel } from '@bt/shared/types';

export interface SubscriptionListItem extends SubscriptionModel {
  linkedTransactionsCount: number;
  account?: { id: number; name: string; currencyCode: string } | null;
  category?: { id: number; name: string; color: string; icon: string | null } | null;
}

interface SubscriptionDetail extends SubscriptionModel {
  nextExpectedDate: string | null;
  account?: { id: number; name: string; currencyCode: string } | null;
  category?: { id: number; name: string; color: string; icon: string | null } | null;
  transactions?: Array<
    TransactionModel & {
      SubscriptionTransactions: {
        matchSource: string;
        matchedAt: string;
      };
    }
  >;
}

export const loadSubscriptions = async ({
  isActive,
  type,
}: {
  isActive?: boolean;
  type?: string;
} = {}): Promise<SubscriptionListItem[]> => {
  const query: Record<string, string> = {};
  if (isActive !== undefined) query.isActive = String(isActive);
  if (type) query.type = type;

  return api.get('/subscriptions', query);
};

export const loadSubscriptionById = async ({ id }: { id: string }): Promise<SubscriptionDetail> => {
  return api.get(`/subscriptions/${id}`);
};

export const createSubscription = async (
  payload: Omit<SubscriptionModel, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
): Promise<SubscriptionModel> => {
  return api.post('/subscriptions', payload);
};

export const updateSubscription = async ({
  id,
  payload,
}: {
  id: string;
  payload: Partial<Omit<SubscriptionModel, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>;
}): Promise<SubscriptionModel> => {
  return api.put(`/subscriptions/${id}`, payload);
};

export const deleteSubscription = async ({ id }: { id: string }) => {
  return api.delete(`/subscriptions/${id}`);
};

export const toggleSubscriptionActive = async ({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}): Promise<SubscriptionModel> => {
  return api.patch(`/subscriptions/${id}/toggle-active`, { isActive });
};

export const linkTransactionsToSubscription = async ({
  id,
  transactionIds,
}: {
  id: string;
  transactionIds: number[];
}): Promise<{ linked: number }> => {
  return api.post(`/subscriptions/${id}/transactions`, { transactionIds });
};

export const unlinkTransactionsFromSubscription = async ({
  id,
  transactionIds,
}: {
  id: string;
  transactionIds: number[];
}): Promise<{ unlinked: number }> => {
  return api.delete(`/subscriptions/${id}/transactions`, {
    data: { transactionIds },
  });
};

export const loadSuggestedMatches = async ({ id }: { id: string }): Promise<TransactionModel[]> => {
  return api.get(`/subscriptions/${id}/suggest-matches`);
};

interface SubscriptionsSummary {
  estimatedMonthlyCost: number;
  projectedYearlyCost: number;
  activeCount: number;
  currencyCode: string;
}

export const loadSubscriptionsSummary = async ({
  type,
}: {
  type?: string;
} = {}): Promise<SubscriptionsSummary> => {
  const query: Record<string, string> = {};
  if (type) query.type = type;

  return api.get('/subscriptions/summary', query);
};
