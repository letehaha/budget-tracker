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
  minPayment: number | null;
  refMinPayment: number | null;
  plannedPayment: number | null;
  refPlannedPayment: number | null;
  paymentDayOfMonth: number | null;
  lenderName: string | null;
  accountNumber: string | null;
  replacedByLoanId: RecordId | null;
  events: LoanEventApi[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Flat Account fields + nested loanDetails + projection. The top-level `id` is
 * the underlying Account id — a loan IS an Account from the frontend's
 * perspective. Liability balances arrive negative.
 */
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
}

export const getLoans = async (): Promise<LoanApi[]> => {
  return api.get('/loans');
};

export const getLoanById = async ({ id }: { id: string }): Promise<LoanApi> => {
  return api.get(`/loans/${id}`);
};

/**
 * Decimals in, decimals out. The backend converts incoming decimals to cents
 * via the MoneyColumn pipeline; never send cents from the frontend.
 */
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
 * Patch payload. Every field is optional; backend rejects an empty body.
 * `currencyCode` and `loanType` are intentionally absent — switching currency
 * on an existing account isn't supported, and loanType isn't a timeline-
 * worthy change for Phase 1.
 *
 * `currentBalance` is the outstanding amount as a positive decimal; the
 * service flips the sign before writing to Accounts.currentBalance.
 */
export interface UpdateLoanPayload {
  name?: string;
  currentBalance?: number;
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
