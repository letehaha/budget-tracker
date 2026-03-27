import { api } from '@/api/_api';
import {
  TAG_RULE_APPROVAL_MODE,
  TAG_RULE_TYPE,
  TagAutoMatchRuleModel,
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

// Tag Auto-Match Rules API

type CreateAutoMatchRulePayload = {
  approvalMode?: TAG_RULE_APPROVAL_MODE;
} & (
  | { type: TAG_RULE_TYPE.code; codePattern: string; aiPrompt?: never }
  | { type: TAG_RULE_TYPE.ai; aiPrompt: string; codePattern?: never }
);

interface UpdateAutoMatchRulePayload {
  approvalMode?: TAG_RULE_APPROVAL_MODE;
  codePattern?: string;
  aiPrompt?: string;
  isEnabled?: boolean;
}

export const loadAutoMatchRules = async ({ tagId }: { tagId: number }): Promise<TagAutoMatchRuleModel[]> => {
  return api.get(`/tags/${tagId}/auto-match-rules`);
};

export const createAutoMatchRule = async ({
  tagId,
  payload,
}: {
  tagId: number;
  payload: CreateAutoMatchRulePayload;
}): Promise<TagAutoMatchRuleModel> => {
  return api.post(`/tags/${tagId}/auto-match-rules`, payload);
};

export const updateAutoMatchRule = async ({
  tagId,
  id,
  payload,
}: {
  tagId: number;
  id: string;
  payload: UpdateAutoMatchRulePayload;
}): Promise<TagAutoMatchRuleModel> => {
  return api.put(`/tags/${tagId}/auto-match-rules/${id}`, payload);
};

export const deleteAutoMatchRule = async ({ tagId, id }: { tagId: number; id: string }): Promise<void> => {
  return api.delete(`/tags/${tagId}/auto-match-rules/${id}`);
};

export const toggleAutoMatchRule = async ({
  tagId,
  id,
}: {
  tagId: number;
  id: string;
}): Promise<TagAutoMatchRuleModel> => {
  return api.patch(`/tags/${tagId}/auto-match-rules/${id}/toggle`);
};
