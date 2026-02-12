import { api } from '@/api/_api';
import { SUBSCRIPTION_CANDIDATE_STATUS, SUBSCRIPTION_FREQUENCIES } from '@bt/shared/types';

export interface SubscriptionCandidatePossibleMatch {
  id: string;
  name: string;
}

export interface SubscriptionCandidate {
  id: string;
  suggestedName: string;
  detectedFrequency: SUBSCRIPTION_FREQUENCIES;
  /** Average amount as decimal (already converted from cents) */
  averageAmount: number;
  currencyCode: string;
  accountId: number | null;
  sampleTransactionIds: number[];
  occurrenceCount: number;
  confidenceScore: number;
  medianIntervalDays: number;
  status: SUBSCRIPTION_CANDIDATE_STATUS;
  detectedAt: string;
  possibleMatch: SubscriptionCandidatePossibleMatch | null;
  isOutdated: boolean;
}

export interface DetectCandidatesResponse {
  candidates: SubscriptionCandidate[];
  lastRunAt: string | null;
  isFromCache: boolean;
}

export const detectSubscriptionCandidates = async (): Promise<DetectCandidatesResponse> => {
  return api.get('/subscriptions/detect-candidates');
};

export const loadSubscriptionCandidates = async ({
  status,
}: {
  status?: SUBSCRIPTION_CANDIDATE_STATUS;
} = {}): Promise<SubscriptionCandidate[]> => {
  const query: Record<string, string> = {};
  if (status) query.status = status;

  return api.get('/subscriptions/candidates', query);
};

export const acceptSubscriptionCandidate = async ({
  id,
  subscriptionId,
}: {
  id: string;
  subscriptionId?: string;
}): Promise<{ id: string; status: string }> => {
  return api.post(`/subscriptions/candidates/${id}/accept`, subscriptionId ? { subscriptionId } : undefined);
};

export const dismissSubscriptionCandidate = async ({ id }: { id: string }): Promise<{ id: string; status: string }> => {
  return api.post(`/subscriptions/candidates/${id}/dismiss`);
};

export const linkCandidateToSubscription = async ({
  id,
  subscriptionId,
}: {
  id: string;
  subscriptionId: string;
}): Promise<{ id: string; status: string }> => {
  return api.post(`/subscriptions/candidates/${id}/link`, { subscriptionId });
};
