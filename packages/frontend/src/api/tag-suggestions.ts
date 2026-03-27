import { api } from '@/api/_api';
import { TAG_SUGGESTION_SOURCE, TagModel } from '@bt/shared/types';

interface TagSuggestionTransaction {
  id: number;
  note: string | null;
  amount: number;
  time: string;
  accountId: number;
  currencyCode: string;
  transactionType: string;
}

interface TagSuggestionItem {
  tagId: number;
  tag: Pick<TagModel, 'id' | 'name' | 'color' | 'icon'>;
  source: TAG_SUGGESTION_SOURCE;
  ruleId: string | null;
  createdAt: string;
}

interface TagSuggestionGroup {
  transaction: TagSuggestionTransaction;
  suggestions: TagSuggestionItem[];
}

export const loadTagSuggestions = async ({
  limit,
  offset,
}: {
  limit?: number;
  offset?: number;
} = {}): Promise<TagSuggestionGroup[]> => {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  const query = params.toString();
  return api.get(`/tag-suggestions${query ? `?${query}` : ''}`);
};

export const loadTagSuggestionsCount = async (): Promise<{ count: number }> => {
  return api.get('/tag-suggestions/count');
};

export const approveTagSuggestion = async ({
  transactionId,
  tagId,
}: {
  transactionId: number;
  tagId: number;
}): Promise<void> => {
  return api.post('/tag-suggestions/approve', { transactionId, tagId });
};

export const rejectTagSuggestion = async ({
  transactionId,
  tagId,
}: {
  transactionId: number;
  tagId: number;
}): Promise<void> => {
  return api.post('/tag-suggestions/reject', { transactionId, tagId });
};

export const bulkApproveTagSuggestions = async ({
  items,
}: {
  items: Array<{ transactionId: number; tagId: number }>;
}): Promise<{ approvedCount: number; skippedCount: number }> => {
  return api.post('/tag-suggestions/bulk-approve', { items });
};

export const bulkRejectTagSuggestions = async ({
  items,
}: {
  items: Array<{ transactionId: number; tagId: number }>;
}): Promise<{ rejectedCount: number; skippedCount: number }> => {
  return api.post('/tag-suggestions/bulk-reject', { items });
};
