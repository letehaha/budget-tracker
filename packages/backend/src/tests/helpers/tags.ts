import {
  TAG_REMINDER_FREQUENCIES,
  TAG_REMINDER_TYPES,
  TagModel,
  TagReminderFrequency,
  TagReminderModel,
  TagReminderSettings,
  TagReminderType,
} from '@bt/shared/types';

import { makeRequest } from './common';

// Tags

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

export async function createTag<R extends boolean | undefined = undefined>({
  payload,
  raw,
}: {
  payload: CreateTagPayload;
  raw?: R;
}) {
  return makeRequest<TagModel, R>({
    method: 'post',
    url: '/tags',
    payload,
    raw,
  });
}

export async function getTags<R extends boolean | undefined = undefined>({
  raw,
}: {
  raw?: R;
} = {}) {
  return makeRequest<TagModel[], R>({
    method: 'get',
    url: '/tags',
    raw,
  });
}

export async function getTagById<R extends boolean | undefined = undefined>({ id, raw }: { id: number; raw?: R }) {
  return makeRequest<TagModel, R>({
    method: 'get',
    url: `/tags/${id}`,
    raw,
  });
}

export async function updateTag<R extends boolean | undefined = undefined>({
  id,
  payload,
  raw,
}: {
  id: number;
  payload: UpdateTagPayload;
  raw?: R;
}) {
  return makeRequest<TagModel, R>({
    method: 'put',
    url: `/tags/${id}`,
    payload,
    raw,
  });
}

export async function deleteTag<R extends boolean | undefined = undefined>({ id, raw }: { id: number; raw?: R }) {
  return makeRequest<void, R>({
    method: 'delete',
    url: `/tags/${id}`,
    raw,
  });
}

export async function addTransactionsToTag<R extends boolean | undefined = undefined>({
  tagId,
  transactionIds,
  raw,
}: {
  tagId: number;
  transactionIds: number[];
  raw?: R;
}) {
  return makeRequest<{ message: string; addedCount: number; skippedCount: number }, R>({
    method: 'post',
    url: `/tags/${tagId}/transactions`,
    payload: { transactionIds },
    raw,
  });
}

export async function removeTransactionsFromTag<R extends boolean | undefined = undefined>({
  tagId,
  transactionIds,
  raw,
}: {
  tagId: number;
  transactionIds: number[];
  raw?: R;
}) {
  return makeRequest<{ message: string; removedCount: number }, R>({
    method: 'delete',
    url: `/tags/${tagId}/transactions`,
    payload: { transactionIds },
    raw,
  });
}

// Tag Reminders

export interface CreateTagReminderPayload {
  type: TagReminderType;
  frequency?: TagReminderFrequency | null;
  dayOfMonth?: number | null;
  settings?: TagReminderSettings;
  isEnabled?: boolean;
}

export interface UpdateTagReminderPayload {
  type?: TagReminderType;
  frequency?: TagReminderFrequency | null;
  dayOfMonth?: number | null;
  settings?: TagReminderSettings;
  isEnabled?: boolean;
}

export async function createTagReminder<R extends boolean | undefined = undefined>({
  tagId,
  payload,
  raw,
}: {
  tagId: number;
  payload: CreateTagReminderPayload;
  raw?: R;
}) {
  return makeRequest<TagReminderModel, R>({
    method: 'post',
    url: `/tags/${tagId}/reminders`,
    payload,
    raw,
  });
}

export async function getRemindersForTag<R extends boolean | undefined = undefined>({
  tagId,
  raw,
}: {
  tagId: number;
  raw?: R;
}) {
  return makeRequest<TagReminderModel[], R>({
    method: 'get',
    url: `/tags/${tagId}/reminders`,
    raw,
  });
}

export async function getAllReminders<R extends boolean | undefined = undefined>({
  raw,
}: {
  raw?: R;
} = {}) {
  return makeRequest<TagReminderModel[], R>({
    method: 'get',
    url: '/tag-reminders',
    raw,
  });
}

export async function getReminderById<R extends boolean | undefined = undefined>({
  tagId,
  id,
  raw,
}: {
  tagId: number;
  id: number;
  raw?: R;
}) {
  return makeRequest<TagReminderModel, R>({
    method: 'get',
    url: `/tags/${tagId}/reminders/${id}`,
    raw,
  });
}

export async function updateTagReminder<R extends boolean | undefined = undefined>({
  tagId,
  id,
  payload,
  raw,
}: {
  tagId: number;
  id: number;
  payload: UpdateTagReminderPayload;
  raw?: R;
}) {
  return makeRequest<TagReminderModel, R>({
    method: 'put',
    url: `/tags/${tagId}/reminders/${id}`,
    payload,
    raw,
  });
}

export async function deleteTagReminder<R extends boolean | undefined = undefined>({
  tagId,
  id,
  raw,
}: {
  tagId: number;
  id: number;
  raw?: R;
}) {
  return makeRequest<void, R>({
    method: 'delete',
    url: `/tags/${tagId}/reminders/${id}`,
    raw,
  });
}

// Builder helpers

export function buildTagPayload(overrides: Partial<CreateTagPayload> = {}): CreateTagPayload {
  return {
    name: `Test Tag ${Date.now()}`,
    color: '#3b82f6',
    icon: null,
    description: null,
    ...overrides,
  };
}

export function buildTagReminderPayload(overrides: Partial<CreateTagReminderPayload> = {}): CreateTagReminderPayload {
  return {
    type: TAG_REMINDER_TYPES.amountThreshold,
    frequency: TAG_REMINDER_FREQUENCIES.monthly,
    dayOfMonth: 1,
    settings: { amountThreshold: 1000 },
    isEnabled: true,
    ...overrides,
  };
}

/**
 * Build a real-time reminder payload (no schedule - triggers immediately when tagged)
 */
export function buildRealTimeReminderPayload(
  overrides: Partial<CreateTagReminderPayload> = {},
): CreateTagReminderPayload {
  return {
    type: TAG_REMINDER_TYPES.amountThreshold,
    frequency: null,
    dayOfMonth: null,
    settings: { amountThreshold: 1000 },
    isEnabled: true,
    ...overrides,
  };
}
