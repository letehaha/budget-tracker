import { api } from '@/api/_api';
import type {
  ACCOUNT_STATUSES,
  BANK_PROVIDER_TYPE,
  LoanEventApi,
  LoanProjection,
  RecordId,
  ResourceShareInfo,
} from '@bt/shared/types';
import { LOAN_TYPE } from '@bt/shared/types';

export interface LoanDetailsApi {
  id: RecordId;
  loanType: LOAN_TYPE;
  /** Decimal in the loan's currency. */
  originalPrincipal: number;
  refOriginalPrincipal: number;
  /** APR as percent (e.g. 6 for 6%). */
  interestRate: number;
  termMonths: number | null;
  startDate: string;
  /** Date the outstanding balance is asserted as-of; payments after it adjust the balance. */
  balanceAnchorDate: string;
  minPayment: number | null;
  refMinPayment: number | null;
  plannedPayment: number | null;
  refPlannedPayment: number | null;
  paymentDayOfMonth: number | null;
  lenderName: string | null;
  accountNumber: string | null;
  events: LoanEventApi[];
  createdAt: string;
  updatedAt: string;
}

/** `id` is the underlying Account id – a loan IS an Account. Liability balances arrive negative. */
export interface LoanApi {
  id: RecordId;
  name: string;
  initialBalance: number;
  refInitialBalance: number;
  currentBalance: number;
  refCurrentBalance: number;
  creditLimit: number;
  refCreditLimit: number;
  type: string;
  accountCategory: string;
  currencyCode: string;
  userId: number;
  externalId: string | null;
  status: ACCOUNT_STATUSES;
  excludeFromStats: boolean;
  bankDataProviderConnectionId: string | null;
  bankProviderType: BANK_PROVIDER_TYPE | null;
  needsRelink?: boolean;
  share?: ResourceShareInfo;

  loanDetails: LoanDetailsApi;
  projection: LoanProjection;
  /** Payment legs recorded against this loan; drives the delete-blocked warning. */
  paymentsCount: number;
}

export const getLoans = async (): Promise<LoanApi[]> => {
  return api.get('/loans');
};

export const getLoanById = async ({ id }: { id: string }): Promise<LoanApi> => {
  return api.get(`/loans/${id}`);
};

/** Decimals in/out – backend converts to cents via MoneyColumn; never send cents. */
export interface CreateLoanPayload {
  name: string;
  currencyCode: string;
  initialBalance: number;

  loanType: LOAN_TYPE;
  originalPrincipal: number;
  interestRate: number;
  termMonths?: number | null;
  startDate: string;
  minPayment?: number | null;
  plannedPayment?: number | null;
  paymentDayOfMonth?: number | null;
  lenderName?: string | null;
  accountNumber?: string | null;
}

export const createLoan = async (payload: CreateLoanPayload): Promise<LoanApi> => {
  return api.post('/loans', payload);
};

/**
 * All fields optional (empty body rejected). No `currencyCode`/`loanType` – currency
 * switch unsupported, loanType is UI-only. `currentBalance` is positive; the service
 * flips the sign before writing to Accounts.currentBalance.
 */
export interface UpdateLoanPayload {
  name?: string;
  currentBalance?: number;
  /** 'yyyy-MM-dd' date the balance correction is asserted as-of. Only sent when currentBalance is included. */
  currentBalanceAsOf?: string;
  interestRate?: number;
  termMonths?: number | null;
  startDate?: string;
  minPayment?: number | null;
  plannedPayment?: number | null;
  paymentDayOfMonth?: number | null;
  lenderName?: string | null;
  accountNumber?: string | null;
}

export const updateLoan = async ({ id, ...payload }: UpdateLoanPayload & { id: string }): Promise<LoanApi> => {
  return api.patch(`/loans/${id}`, payload);
};

export const deleteLoan = async ({ id }: { id: string }): Promise<void> => {
  return api.delete(`/loans/${id}`);
};

interface LinkLoanPaymentsResponse {
  loan: LoanApi;
  /** Number of transactions converted into payments. */
  linkedCount: number;
}

/**
 * Converts expense transactions into transfer-to-loan payments. Backend refuses with
 * `loanPaymentOverpayConfirmationRequired` on overpay; retry with `confirmOverpay: true`.
 */
export const linkLoanPayments = async ({
  id,
  transactionIds,
  confirmOverpay,
}: {
  id: string;
  transactionIds: string[];
  confirmOverpay?: boolean;
}): Promise<LinkLoanPaymentsResponse> => {
  return api.post(`/loans/${id}/link-payments`, { transactionIds, confirmOverpay });
};

interface UnlinkLoanPaymentResponse {
  loan: LoanApi;
  /** Id of the expense transaction that was restored from the deleted loan-side leg. */
  restoredTransactionId: string;
}

/**
 * Delete the loan-side leg of a linked payment and restore the original
 * expense transaction. The loan balance is recalculated after unlinking.
 */
export const unlinkLoanPayment = async ({
  id,
  transactionId,
}: {
  id: string;
  transactionId: string;
}): Promise<UnlinkLoanPaymentResponse> => {
  return api.post(`/loans/${id}/unlink-payment`, { transactionId });
};
