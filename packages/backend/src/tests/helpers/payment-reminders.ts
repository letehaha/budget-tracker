import { RemindBeforePreset, SUBSCRIPTION_FREQUENCIES } from '@bt/shared/types';
import type { createReminder as apiCreateReminder } from '@services/payment-reminders/create-reminder';
import type { deleteReminder as apiDeleteReminder } from '@services/payment-reminders/delete-reminder';
import type { getPeriods as apiGetPeriods } from '@services/payment-reminders/get-periods';
import type { getReminderById as apiGetReminderById } from '@services/payment-reminders/get-reminder-by-id';
import type { getReminders as apiGetReminders } from '@services/payment-reminders/get-reminders';
import type { markPeriodPaid as apiMarkPeriodPaid } from '@services/payment-reminders/mark-period-paid';
import type { skipPeriod as apiSkipPeriod } from '@services/payment-reminders/skip-period';
import type { unlinkTransaction as apiUnlinkTransaction } from '@services/payment-reminders/unlink-transaction';
import type { updateReminder as apiUpdateReminder } from '@services/payment-reminders/update-reminder';

import { makeRequest } from './common';

interface CreateReminderPayload {
  name: string;
  dueDate: string;
  subscriptionId?: string;
  expectedAmount?: number | null;
  currencyCode?: string | null;
  frequency?: SUBSCRIPTION_FREQUENCIES | null;
  remindBefore?: RemindBeforePreset[];
  notifyEmail?: boolean;
  preferredTime?: number;
  timezone?: string;
  categoryId?: number | null;
  notes?: string | null;
}

interface UpdateReminderPayload {
  name?: string;
  dueDate?: string;
  expectedAmount?: number | null;
  currencyCode?: string | null;
  frequency?: SUBSCRIPTION_FREQUENCIES | null;
  remindBefore?: RemindBeforePreset[];
  notifyEmail?: boolean;
  preferredTime?: number;
  timezone?: string;
  categoryId?: number | null;
  notes?: string | null;
  isActive?: boolean;
}

export async function createPaymentReminder<R extends boolean | undefined = undefined>({
  raw,
  ...payload
}: CreateReminderPayload & { raw?: R }) {
  return makeRequest<Awaited<ReturnType<typeof apiCreateReminder>>, R>({
    method: 'post',
    url: '/payment-reminders',
    payload,
    raw,
  });
}

export async function getPaymentReminders<R extends boolean | undefined = undefined>({
  raw,
  includeInactive,
}: {
  raw?: R;
  includeInactive?: boolean;
} = {}) {
  const query: Record<string, string> = {};
  if (includeInactive !== undefined) query.includeInactive = String(includeInactive);

  return makeRequest<Awaited<ReturnType<typeof apiGetReminders>>, R>({
    method: 'get',
    url: '/payment-reminders',
    payload: Object.keys(query).length ? query : undefined,
    raw,
  });
}

export async function getPaymentReminderById<R extends boolean | undefined = undefined>({
  id,
  raw,
}: {
  id: string;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof apiGetReminderById>>, R>({
    method: 'get',
    url: `/payment-reminders/${id}`,
    raw,
  });
}

export async function updatePaymentReminder<R extends boolean | undefined = undefined>({
  id,
  raw,
  ...payload
}: UpdateReminderPayload & { id: string; raw?: R }) {
  return makeRequest<Awaited<ReturnType<typeof apiUpdateReminder>>, R>({
    method: 'put',
    url: `/payment-reminders/${id}`,
    payload,
    raw,
  });
}

export async function deletePaymentReminder<R extends boolean | undefined = undefined>({
  id,
  raw,
}: {
  id: string;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof apiDeleteReminder>>, R>({
    method: 'delete',
    url: `/payment-reminders/${id}`,
    raw,
  });
}

export async function getPaymentReminderPeriods<R extends boolean | undefined = undefined>({
  reminderId,
  raw,
  limit,
  offset,
}: {
  reminderId: string;
  raw?: R;
  limit?: number;
  offset?: number;
}) {
  const query: Record<string, string> = {};
  if (limit !== undefined) query.limit = String(limit);
  if (offset !== undefined) query.offset = String(offset);

  return makeRequest<Awaited<ReturnType<typeof apiGetPeriods>>, R>({
    method: 'get',
    url: `/payment-reminders/${reminderId}/periods`,
    payload: Object.keys(query).length ? query : undefined,
    raw,
  });
}

export async function markPaymentReminderPeriodPaid<R extends boolean | undefined = undefined>({
  reminderId,
  periodId,
  raw,
  transactionId,
  notes,
}: {
  reminderId: string;
  periodId: string;
  raw?: R;
  transactionId?: number | null;
  notes?: string | null;
}) {
  const payload: Record<string, unknown> = {};
  if (transactionId !== undefined) payload.transactionId = transactionId;
  if (notes !== undefined) payload.notes = notes;

  return makeRequest<Awaited<ReturnType<typeof apiMarkPeriodPaid>>, R>({
    method: 'post',
    url: `/payment-reminders/${reminderId}/periods/${periodId}/pay`,
    payload: Object.keys(payload).length ? payload : undefined,
    raw,
  });
}

export async function skipPaymentReminderPeriod<R extends boolean | undefined = undefined>({
  reminderId,
  periodId,
  raw,
}: {
  reminderId: string;
  periodId: string;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof apiSkipPeriod>>, R>({
    method: 'post',
    url: `/payment-reminders/${reminderId}/periods/${periodId}/skip`,
    raw,
  });
}

export async function unlinkPaymentReminderTransaction<R extends boolean | undefined = undefined>({
  reminderId,
  periodId,
  raw,
}: {
  reminderId: string;
  periodId: string;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof apiUnlinkTransaction>>, R>({
    method: 'post',
    url: `/payment-reminders/${reminderId}/periods/${periodId}/unlink`,
    raw,
  });
}
