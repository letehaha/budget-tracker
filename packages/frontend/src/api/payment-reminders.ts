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

export interface ReminderPayPreview {
  /** True when the reminder's billed currency differs from its account's currency. */
  isCrossCurrency: boolean;
  /** ISO code the booked expense will be denominated in (the account's currency), or null when no account is linked. */
  accountCurrencyCode: string | null;
  /** ISO code the reminder is billed in. */
  reminderCurrencyCode: string | null;
  /** Billed amount in the reminder's own currency, or null for a variable-amount reminder. */
  expectedAmount: number | null;
  /** Billed amount converted into the account currency at today's rate, used to pre-fill the pay dialog. */
  convertedAmount: number | null;
}

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
  categoryId?: string | null;
  accountId?: string | null;
  maxOccurrences?: number | null;
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
  categoryId?: string | null;
  accountId?: string | null;
  maxOccurrences?: number | null;
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

export const getReminderPayPreview = async ({ reminderId }: { reminderId: string }): Promise<ReminderPayPreview> => {
  return api.get(`/payment-reminders/${reminderId}/pay-preview`);
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
  createTransaction,
  amount,
  time,
}: {
  reminderId: string;
  periodId: string;
  transactionId?: string | null;
  notes?: string | null;
  /** Generate the expense transaction from the reminder. Mutually exclusive with transactionId. */
  createTransaction?: boolean;
  /** Decimal amount override for the generated transaction. Falls back to the reminder's expectedAmount. */
  amount?: number;
  /** Actual payment date for the generated transaction. Falls back to now. */
  time?: Date;
}): Promise<PaymentReminderPeriodModel> => {
  const payload: Record<string, unknown> = {};
  if (transactionId !== undefined) payload.transactionId = transactionId;
  if (notes !== undefined) payload.notes = notes;
  if (createTransaction !== undefined) payload.createTransaction = createTransaction;
  if (amount !== undefined) payload.amount = amount;
  if (time !== undefined) payload.time = time.toISOString();

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
