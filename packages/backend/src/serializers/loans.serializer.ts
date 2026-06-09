/**
 * Loan Serializers
 *
 * A loan response is the underlying Account spread at the top level (a loan
 * IS an Account) with `loanDetails` and `projection` nested alongside. Lets
 * the frontend treat a loan as an Account with extra fields instead of a
 * brand-new shape it has to learn.
 */
import { type LOAN_TYPE, type LoanEvent, type LoanProjection, type RecordId } from '@bt/shared/types';
import { centsToApiDecimal } from '@common/types/money';
import type LoanDetails from '@models/loan-details.model';
import { type AccountApiResponse, serializeAccount } from '@root/serializers/accounts.serializer';

export interface LoanDetailsApiResponse {
  id: RecordId;
  loanType: LOAN_TYPE;
  originalPrincipal: number;
  refOriginalPrincipal: number;
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

export type LoanApiResponse = AccountApiResponse & {
  loanDetails: LoanDetailsApiResponse;
  projection: LoanProjection;
};

function serializeLoanDetails(loanDetails: LoanDetails): LoanDetailsApiResponse {
  return {
    id: loanDetails.id,
    loanType: loanDetails.loanType,
    originalPrincipal: centsToApiDecimal(loanDetails.originalPrincipal),
    refOriginalPrincipal: centsToApiDecimal(loanDetails.refOriginalPrincipal),
    interestRate: Number(loanDetails.interestRate),
    termMonths: loanDetails.termMonths,
    startDate: loanDetails.startDate,
    minPayment: loanDetails.minPayment === null ? null : centsToApiDecimal(loanDetails.minPayment),
    refMinPayment: loanDetails.refMinPayment === null ? null : centsToApiDecimal(loanDetails.refMinPayment),
    plannedPayment: loanDetails.plannedPayment === null ? null : centsToApiDecimal(loanDetails.plannedPayment),
    refPlannedPayment: loanDetails.refPlannedPayment === null ? null : centsToApiDecimal(loanDetails.refPlannedPayment),
    paymentDayOfMonth: loanDetails.paymentDayOfMonth,
    lenderName: loanDetails.lenderName,
    accountNumber: loanDetails.accountNumber,
    replacedByLoanId: loanDetails.replacedByLoanId,
    events: loanDetails.events ?? [],
    createdAt: loanDetails.createdAt.toISOString(),
    updatedAt: loanDetails.updatedAt.toISOString(),
  };
}

export function serializeLoan({
  loanDetails,
  projection,
}: {
  loanDetails: LoanDetails;
  projection: LoanProjection;
}): LoanApiResponse {
  const account = loanDetails.account;
  if (!account) {
    throw new Error('serializeLoan: loanDetails.account is missing — include Accounts in the query');
  }
  return {
    ...serializeAccount(account),
    loanDetails: serializeLoanDetails(loanDetails),
    projection,
  };
}

export function serializeLoans(loans: { loanDetails: LoanDetails; projection: LoanProjection }[]): LoanApiResponse[] {
  return loans.map(serializeLoan);
}
