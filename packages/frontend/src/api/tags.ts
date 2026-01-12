import { api } from '@/api/_api';
import { fromSystemAmount, toSystemAmount } from '@/api/helpers';
import {
  TagModel,
  TagReminderFrequency,
  TagReminderModel,
  TagReminderSettings,
  TagReminderType,
} from '@bt/shared/types';

/**
 * Converts reminder's amountThreshold from system amount (cents) to display amount.
 */
function convertReminderFromApi(reminder: TagReminderModel): TagReminderModel {
  const settings = reminder.settings as { amountThreshold?: number } | undefined;
  if (settings?.amountThreshold !== undefined) {
    return {
      ...reminder,
      settings: {
        ...settings,
        amountThreshold: fromSystemAmount(settings.amountThreshold),
      },
    };
  }
  return reminder;
}

/**
 * Converts reminder payload's amountThreshold to system amount (cents) for API.
 */
function convertReminderPayloadToApi<T extends { settings?: TagReminderSettings }>(payload: T): T {
  const settings = payload.settings as { amountThreshold?: number } | undefined;
  if (settings?.amountThreshold !== undefined) {
    return {
      ...payload,
      settings: {
        ...settings,
        amountThreshold: toSystemAmount(settings.amountThreshold),
      },
    };
  }
  return payload;
}

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
  const reminders = await api.get<TagReminderModel[]>(`/tags/${tagId}/reminders`);
  return reminders.map(convertReminderFromApi);
};

export const createReminder = async ({
  tagId,
  payload,
}: {
  tagId: number;
  payload: CreateTagReminderPayload;
}): Promise<TagReminderModel> => {
  const reminder: TagReminderModel = await api.post(`/tags/${tagId}/reminders`, convertReminderPayloadToApi(payload));
  return convertReminderFromApi(reminder);
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
  const reminder: TagReminderModel = await api.put(
    `/tags/${tagId}/reminders/${id}`,
    convertReminderPayloadToApi(payload),
  );
  return convertReminderFromApi(reminder);
};

export const deleteReminder = async ({ tagId, id }: { tagId: number; id: number }): Promise<void> => {
  return api.delete(`/tags/${tagId}/reminders/${id}`);
};
