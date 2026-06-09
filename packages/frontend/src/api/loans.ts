import { api } from '@/api/_api';
import type {
  ACCOUNT_STATUSES,
  BANK_PROVIDER_TYPE,
  LOAN_TYPE,
  LoanEvent,
  LoanProjection,
  RecordId,
  ResourceShareInfo,
} from '@bt/shared/types';

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
  events: LoanEvent[];
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
