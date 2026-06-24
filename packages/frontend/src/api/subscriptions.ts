import { api } from '@/api/_api';
import type {
  RemindBeforePreset,
  SubscriptionModel,
  SubscriptionPeriodModel,
  TransactionModel,
} from '@bt/shared/types';

/** Minimal open-period shape the list exposes for the "Due in N days" chip + quick pay. */
export interface SubscriptionListCurrentPeriod {
  id: string;
  dueDate: string;
  status: SubscriptionPeriodModel['status'];
}

export interface SubscriptionListItem extends SubscriptionModel {
  linkedTransactionsCount: number;
  /** Earliest open (upcoming or overdue) period, or null for detection-only subscriptions. */
  currentPeriod: SubscriptionListCurrentPeriod | null;
  account?: { id: string; name: string; currencyCode: string } | null;
  category?: { id: string; name: string; color: string; icon: string | null } | null;
}

interface SubscriptionDetail extends SubscriptionModel {
  nextExpectedDate: string | null;
  periods: SubscriptionPeriodModel[];
  account?: { id: string; name: string; currencyCode: string } | null;
  category?: { id: string; name: string; color: string; icon: string | null } | null;
  transactions?: Array<
    TransactionModel & {
      SubscriptionTransactions: {
        matchSource: string;
        matchedAt: string;
      };
    }
  >;
}

export const loadSubscriptions = async ({
  isActive,
  type,
}: {
  isActive?: boolean;
  type?: string;
} = {}): Promise<SubscriptionListItem[]> => {
  const query: Record<string, string> = {};
  if (isActive !== undefined) query.isActive = String(isActive);
  if (type) query.type = type;

  return api.get('/subscriptions', query);
};

export const loadSubscriptionById = async ({ id }: { id: string }): Promise<SubscriptionDetail> => {
  return api.get(`/subscriptions/${id}`);
};

export const createSubscription = async (
  payload: Partial<Omit<SubscriptionModel, 'id' | 'userId' | 'createdAt' | 'updatedAt'>> &
    Pick<SubscriptionModel, 'name' | 'frequency' | 'startDate'> & {
      dueDate?: string | null;
      maxOccurrences?: number | null;
      remindBefore?: RemindBeforePreset[];
      notifyEmail?: boolean;
    },
): Promise<SubscriptionModel> => {
  return api.post('/subscriptions', payload);
};

export const updateSubscription = async ({
  id,
  payload,
}: {
  id: string;
  payload: Partial<Omit<SubscriptionModel, 'id' | 'userId' | 'createdAt' | 'updatedAt'>> & {
    dueDate?: string | null;
    maxOccurrences?: number | null;
    remindBefore?: RemindBeforePreset[];
    notifyEmail?: boolean;
  };
}): Promise<SubscriptionModel> => {
  return api.put(`/subscriptions/${id}`, payload);
};

export const deleteSubscription = async ({ id }: { id: string }) => {
  return api.delete(`/subscriptions/${id}`);
};

export const toggleSubscriptionActive = async ({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}): Promise<SubscriptionModel> => {
  return api.patch(`/subscriptions/${id}/toggle-active`, { isActive });
};

export const linkTransactionsToSubscription = async ({
  id,
  transactionIds,
}: {
  id: string;
  transactionIds: string[];
}): Promise<{ linked: number }> => {
  return api.post(`/subscriptions/${id}/transactions`, { transactionIds });
};

export const unlinkTransactionsFromSubscription = async ({
  id,
  transactionIds,
}: {
  id: string;
  transactionIds: string[];
}): Promise<{ unlinked: number }> => {
  return api.delete(`/subscriptions/${id}/transactions`, {
    data: { transactionIds },
  });
};

export const loadSuggestedMatches = async ({ id }: { id: string }): Promise<TransactionModel[]> => {
  return api.get(`/subscriptions/${id}/suggest-matches`);
};

interface UpcomingPayment {
  subscriptionId: string;
  subscriptionName: string;
  expectedAmount: number;
  expectedCurrencyCode: string | null;
  nextPaymentDate: string | null;
  frequency: string;
  categoryName: string | null;
  categoryColor: string | null;
}

export const loadUpcomingPayments = async ({ limit, type }: { limit?: number; type?: string } = {}): Promise<
  UpcomingPayment[]
> => {
  const query: Record<string, string> = {};
  if (limit !== undefined) query.limit = String(limit);
  if (type) query.type = type;

  return api.get('/subscriptions/upcoming', query);
};

export const INCOME_LOOKBACK_MONTHS_OPTIONS = [1, 3, 6, 12] as const;
export type IncomeLookbackMonths = (typeof INCOME_LOOKBACK_MONTHS_OPTIONS)[number];
export const DEFAULT_INCOME_LOOKBACK_MONTHS: IncomeLookbackMonths = 6;

interface SubscriptionsSummary {
  estimatedMonthlyCost: number;
  projectedYearlyCost: number;
  activeCount: number;
  currencyCode: string;
  averageMonthlyIncome: number;
  percentOfIncome: number | null;
  lookbackMonths: IncomeLookbackMonths;
}

export const loadSubscriptionsSummary = async ({
  type,
  lookbackMonths,
}: {
  type?: string;
  lookbackMonths?: IncomeLookbackMonths;
} = {}): Promise<SubscriptionsSummary> => {
  const query: Record<string, string> = {};
  if (type) query.type = type;
  if (lookbackMonths !== undefined) query.lookbackMonths = String(lookbackMonths);

  return api.get('/subscriptions/summary', query);
};

export interface SubscriptionPayPreview {
  /** True when the subscription's billed currency differs from its account's currency. */
  isCrossCurrency: boolean;
  /** ISO code the booked expense will be denominated in (the account's currency), or null when no account is linked. */
  accountCurrencyCode: string | null;
  /** ISO code the subscription is billed in. */
  subscriptionCurrencyCode: string | null;
  /** Billed amount in the subscription's own currency, or null for a variable-amount subscription. */
  expectedAmount: number | null;
  /** Billed amount converted into the account currency at today's rate, used to pre-fill the pay dialog. */
  convertedAmount: number | null;
}

export const markSubscriptionPeriodPaid = async ({
  id,
  periodId,
  transactionId,
  notes,
  createTransaction,
  amount,
  time,
}: {
  id: string;
  periodId: string;
  transactionId?: string | null;
  notes?: string | null;
  /** Generate the expense transaction from the subscription. Mutually exclusive with transactionId. */
  createTransaction?: boolean;
  /** Decimal amount override for the generated transaction. Falls back to the subscription's expectedAmount. */
  amount?: number;
  /** Actual payment date for the generated transaction. Falls back to now. */
  time?: Date;
}): Promise<SubscriptionPeriodModel> => {
  const payload: Record<string, unknown> = {};
  if (transactionId !== undefined) payload.transactionId = transactionId;
  if (notes !== undefined) payload.notes = notes;
  if (createTransaction !== undefined) payload.createTransaction = createTransaction;
  if (amount !== undefined) payload.amount = amount;
  if (time !== undefined) payload.time = time.toISOString();

  return api.post(`/subscriptions/${id}/periods/${periodId}/pay`, Object.keys(payload).length ? payload : undefined);
};

export const skipSubscriptionPeriod = async ({
  id,
  periodId,
}: {
  id: string;
  periodId: string;
}): Promise<SubscriptionPeriodModel> => {
  return api.post(`/subscriptions/${id}/periods/${periodId}/skip`);
};

export const unlinkSubscriptionPeriodTransaction = async ({
  id,
  periodId,
}: {
  id: string;
  periodId: string;
}): Promise<SubscriptionPeriodModel> => {
  return api.post(`/subscriptions/${id}/periods/${periodId}/unlink`);
};

export const revertSubscriptionPeriod = async ({
  id,
  periodId,
}: {
  id: string;
  periodId: string;
}): Promise<SubscriptionPeriodModel> => {
  return api.post(`/subscriptions/${id}/periods/${periodId}/revert`);
};

export const getSubscriptionPayPreview = async ({ id }: { id: string }): Promise<SubscriptionPayPreview> => {
  return api.get(`/subscriptions/${id}/pay-preview`);
};
