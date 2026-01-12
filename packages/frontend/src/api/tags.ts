import { api } from '@/api/_api';
import { TagModel } from '@bt/shared/types';

export interface CreateTagPayload {
  name: string;
  color: string;
  icon?: string | null;
  description?: string | null;
}

export interface UpdateTagPayload {
  name?: string;
  color?: string;
  icon?: string | null;
  description?: string | null;
}

export const loadTags = async (): Promise<TagModel[]> => {
  return api.get('/tags');
};

export const createTag = async (payload: CreateTagPayload): Promise<TagModel> => {
  return api.post('/tags', payload);
};

export const updateTag = async ({ id, payload }: { id: number; payload: UpdateTagPayload }): Promise<TagModel> => {
  return api.put(`/tags/${id}`, payload);
};

export const deleteTag = async ({ id }: { id: number }): Promise<void> => {
  return api.delete(`/tags/${id}`);
};

export const addTransactionsToTag = async ({
  tagId,
  transactionIds,
}: {
  tagId: number;
  transactionIds: number[];
}): Promise<{ message: string; addedCount: number; skippedCount: number }> => {
  return api.post(`/tags/${tagId}/transactions`, { transactionIds });
};

export const removeTransactionsFromTag = async ({
  tagId,
  transactionIds,
}: {
  tagId: number;
  transactionIds: number[];
}): Promise<{ message: string; removedCount: number }> => {
  return api.delete(`/tags/${tagId}/transactions`, { data: { transactionIds } });
};
