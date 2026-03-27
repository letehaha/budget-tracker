import {
  TAG_REMINDER_FREQUENCIES,
  TAG_REMINDER_TYPES,
  TAG_RULE_APPROVAL_MODE,
  TAG_RULE_TYPE,
  TagAutoMatchRuleModel,
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

// Tag Auto-Match Rules

export type CreateAutoMatchRulePayload = {
  approvalMode?: TAG_RULE_APPROVAL_MODE;
} & (
  | { type: TAG_RULE_TYPE.code; codePattern: string; aiPrompt?: never }
  | { type: TAG_RULE_TYPE.ai; aiPrompt: string; codePattern?: never }
);

export interface UpdateAutoMatchRulePayload {
  approvalMode?: TAG_RULE_APPROVAL_MODE;
  codePattern?: string;
  aiPrompt?: string;
  isEnabled?: boolean;
}

export async function createAutoMatchRule<R extends boolean | undefined = undefined>({
  tagId,
  payload,
  raw,
}: {
  tagId: number;
  payload: CreateAutoMatchRulePayload;
  raw?: R;
}) {
  return makeRequest<TagAutoMatchRuleModel, R>({
    method: 'post',
    url: `/tags/${tagId}/auto-match-rules`,
    payload,
    raw,
  });
}

export async function getAutoMatchRules<R extends boolean | undefined = undefined>({
  tagId,
  raw,
}: {
  tagId: number;
  raw?: R;
}) {
  return makeRequest<TagAutoMatchRuleModel[], R>({
    method: 'get',
    url: `/tags/${tagId}/auto-match-rules`,
    raw,
  });
}

export async function updateAutoMatchRule<R extends boolean | undefined = undefined>({
  tagId,
  id,
  payload,
  raw,
}: {
  tagId: number;
  id: string;
  payload: UpdateAutoMatchRulePayload;
  raw?: R;
}) {
  return makeRequest<TagAutoMatchRuleModel, R>({
    method: 'put',
    url: `/tags/${tagId}/auto-match-rules/${id}`,
    payload,
    raw,
  });
}

export async function deleteAutoMatchRule<R extends boolean | undefined = undefined>({
  tagId,
  id,
  raw,
}: {
  tagId: number;
  id: string;
  raw?: R;
}) {
  return makeRequest<void, R>({
    method: 'delete',
    url: `/tags/${tagId}/auto-match-rules/${id}`,
    raw,
  });
}

export async function toggleAutoMatchRule<R extends boolean | undefined = undefined>({
  tagId,
  id,
  raw,
}: {
  tagId: number;
  id: string;
  raw?: R;
}) {
  return makeRequest<TagAutoMatchRuleModel, R>({
    method: 'patch',
    url: `/tags/${tagId}/auto-match-rules/${id}/toggle`,
    raw,
  });
}

export function buildAutoMatchRulePayload(overrides?: Partial<CreateAutoMatchRulePayload>): CreateAutoMatchRulePayload {
  return {
    type: TAG_RULE_TYPE.code,
    approvalMode: TAG_RULE_APPROVAL_MODE.auto,
    codePattern: 'test pattern',
    ...overrides,
  } as CreateAutoMatchRulePayload;
}

// Tag Suggestions

export async function getTagSuggestions<R extends boolean | undefined = undefined>({ raw }: { raw?: R } = {}) {
  return makeRequest<unknown[], R>({
    method: 'get',
    url: '/tag-suggestions',
    raw,
  });
}

export async function getTagSuggestionsCount<R extends boolean | undefined = undefined>({ raw }: { raw?: R } = {}) {
  return makeRequest<{ count: number }, R>({
    method: 'get',
    url: '/tag-suggestions/count',
    raw,
  });
}

export async function approveTagSuggestion<R extends boolean | undefined = undefined>({
  transactionId,
  tagId,
  raw,
}: {
  transactionId: number;
  tagId: number;
  raw?: R;
}) {
  return makeRequest<void, R>({
    method: 'post',
    url: '/tag-suggestions/approve',
    payload: { transactionId, tagId },
    raw,
  });
}

export async function rejectTagSuggestion<R extends boolean | undefined = undefined>({
  transactionId,
  tagId,
  raw,
}: {
  transactionId: number;
  tagId: number;
  raw?: R;
}) {
  return makeRequest<void, R>({
    method: 'post',
    url: '/tag-suggestions/reject',
    payload: { transactionId, tagId },
    raw,
  });
}

export async function bulkApproveTagSuggestions<R extends boolean | undefined = undefined>({
  items,
  raw,
}: {
  items: Array<{ transactionId: number; tagId: number }>;
  raw?: R;
}) {
  return makeRequest<{ approvedCount: number; skippedCount: number }, R>({
    method: 'post',
    url: '/tag-suggestions/bulk-approve',
    payload: { items },
    raw,
  });
}

export async function bulkRejectTagSuggestions<R extends boolean | undefined = undefined>({
  items,
  raw,
}: {
  items: Array<{ transactionId: number; tagId: number }>;
  raw?: R;
}) {
  return makeRequest<{ rejectedCount: number; skippedCount: number }, R>({
    method: 'post',
    url: '/tag-suggestions/bulk-reject',
    payload: { items },
    raw,
  });
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
