import { api } from '@/api/_api';
import type {
  PaymentReminderModel,
  PaymentReminderPeriodModel,
  RemindBeforePreset,
  SUBSCRIPTION_FREQUENCIES,
  SubscriptionModel,
} from '@bt/shared/types';

export interface PaymentReminderListItem extends PaymentReminderModel {
  periods: PaymentReminderPeriodModel[];
  subscription: Pick<SubscriptionModel, 'id' | 'name'> | null;
}

export type PaymentReminderDetail = PaymentReminderListItem;

interface PaymentReminderPeriodsResponse {
  periods: PaymentReminderPeriodModel[];
  total: number;
}

export interface CreateReminderPayload {
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

export const loadReminders = async ({ includeInactive }: { includeInactive?: boolean } = {}): Promise<
  PaymentReminderListItem[]
> => {
  const query: Record<string, string> = {};
  if (includeInactive !== undefined) query.includeInactive = String(includeInactive);

  return api.get('/payment-reminders', Object.keys(query).length ? query : undefined);
};

export const loadReminderById = async ({ id }: { id: string }): Promise<PaymentReminderDetail> => {
  return api.get(`/payment-reminders/${id}`);
};

export const createReminder = async (payload: CreateReminderPayload): Promise<PaymentReminderDetail> => {
  return api.post('/payment-reminders', payload);
};

export const updateReminder = async ({
  id,
  payload,
}: {
  id: string;
  payload: UpdateReminderPayload;
}): Promise<PaymentReminderDetail> => {
  return api.put(`/payment-reminders/${id}`, payload);
};

export const deleteReminder = async ({ id }: { id: string }) => {
  return api.delete(`/payment-reminders/${id}`);
};

export const loadReminderPeriods = async ({
  reminderId,
  limit,
  offset,
}: {
  reminderId: string;
  limit?: number;
  offset?: number;
}): Promise<PaymentReminderPeriodsResponse> => {
  const query: Record<string, string> = {};
  if (limit !== undefined) query.limit = String(limit);
  if (offset !== undefined) query.offset = String(offset);

  return api.get(`/payment-reminders/${reminderId}/periods`, Object.keys(query).length ? query : undefined);
};

export const markPeriodPaid = async ({
  reminderId,
  periodId,
  transactionId,
  notes,
}: {
  reminderId: string;
  periodId: string;
  transactionId?: number | null;
  notes?: string | null;
}): Promise<PaymentReminderPeriodModel> => {
  const payload: Record<string, unknown> = {};
  if (transactionId !== undefined) payload.transactionId = transactionId;
  if (notes !== undefined) payload.notes = notes;

  return api.post(
    `/payment-reminders/${reminderId}/periods/${periodId}/pay`,
    Object.keys(payload).length ? payload : undefined,
  );
};

export const skipPeriod = async ({
  reminderId,
  periodId,
}: {
  reminderId: string;
  periodId: string;
}): Promise<PaymentReminderPeriodModel> => {
  return api.post(`/payment-reminders/${reminderId}/periods/${periodId}/skip`);
};

export const unlinkPeriodTransaction = async ({
  reminderId,
  periodId,
}: {
  reminderId: string;
  periodId: string;
}): Promise<PaymentReminderPeriodModel> => {
  return api.post(`/payment-reminders/${reminderId}/periods/${periodId}/unlink`);
};

export const revertPeriod = async ({
  reminderId,
  periodId,
}: {
  reminderId: string;
  periodId: string;
}): Promise<PaymentReminderPeriodModel> => {
  return api.post(`/payment-reminders/${reminderId}/periods/${periodId}/revert`);
};
