import { api } from '@/api/_api';
import {
  TagModel,
  TagReminderFrequency,
  TagReminderModel,
  TagReminderSettings,
  TagReminderType,
} from '@bt/shared/types';

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

// Tag Reminders API

export interface CreateTagReminderPayload {
  type: TagReminderType;
  frequency?: TagReminderFrequency | null;
  dayOfMonth?: number | null;
  settings?: TagReminderSettings;
  isEnabled?: boolean;
}

interface UpdateTagReminderPayload {
  type?: TagReminderType;
  frequency?: TagReminderFrequency | null;
  dayOfMonth?: number | null;
  settings?: TagReminderSettings;
  isEnabled?: boolean;
}

export const loadRemindersForTag = async ({ tagId }: { tagId: number }): Promise<TagReminderModel[]> => {
  return api.get<TagReminderModel[]>(`/tags/${tagId}/reminders`);
};

export const createReminder = async ({
  tagId,
  payload,
}: {
  tagId: number;
  payload: CreateTagReminderPayload;
}): Promise<TagReminderModel> => {
  return api.post(`/tags/${tagId}/reminders`, payload);
};

export const updateReminder = async ({
  tagId,
  id,
  payload,
}: {
  tagId: number;
  id: number;
  payload: UpdateTagReminderPayload;
}): Promise<TagReminderModel> => {
  return api.put(`/tags/${tagId}/reminders/${id}`, payload);
};

export const deleteReminder = async ({ tagId, id }: { tagId: number; id: number }): Promise<void> => {
  return api.delete(`/tags/${tagId}/reminders/${id}`);
};
