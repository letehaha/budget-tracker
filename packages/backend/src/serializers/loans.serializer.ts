// A loan response spreads the underlying Account at the top level (a loan IS
// an Account) with `loanDetails` and `projection` nested alongside, so the
// frontend treats a loan as an Account plus extras instead of a new shape.
import {
  type LOAN_TYPE,
  type LoanEvent,
  type LoanEventApi,
  type LoanProjection,
  type RecordId,
} from '@bt/shared/types';
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

export type LoanApiResponse = AccountApiResponse & {
  loanDetails: LoanDetailsApiResponse;
  projection: LoanProjection;
  /** Payment-leg count; frontend warns deletion is blocked before the user confirms. */
  paymentsCount: number;
};

// Events store cents (`fromCents`/`toCents`); wire shape uses decimal `from`/`to`
// like every other money field, so the frontend never converts cents itself.
function serializeLoanEvent(event: LoanEvent): LoanEventApi {
  switch (event.type) {
    case 'planned_payment_change':
      return {
        type: event.type,
        at: event.at,
        from: event.fromCents === null ? null : centsToApiDecimal(event.fromCents),
        to: event.toCents === null ? null : centsToApiDecimal(event.toCents),
      };
    case 'balance_correction':
      return {
        type: event.type,
        at: event.at,
        from: centsToApiDecimal(event.fromCents),
        to: centsToApiDecimal(event.toCents),
      };
    default:
      return event;
  }
}

function serializeLoanDetails(loanDetails: LoanDetails): LoanDetailsApiResponse {
  return {
    id: loanDetails.id,
    loanType: loanDetails.loanType,
    originalPrincipal: centsToApiDecimal(loanDetails.originalPrincipal),
    refOriginalPrincipal: centsToApiDecimal(loanDetails.refOriginalPrincipal),
    interestRate: loanDetails.interestRate,
    termMonths: loanDetails.termMonths,
    startDate: loanDetails.startDate,
    balanceAnchorDate: loanDetails.balanceAnchorDate,
    minPayment: loanDetails.minPayment === null ? null : centsToApiDecimal(loanDetails.minPayment),
    refMinPayment: loanDetails.refMinPayment === null ? null : centsToApiDecimal(loanDetails.refMinPayment),
    plannedPayment: loanDetails.plannedPayment === null ? null : centsToApiDecimal(loanDetails.plannedPayment),
    refPlannedPayment: loanDetails.refPlannedPayment === null ? null : centsToApiDecimal(loanDetails.refPlannedPayment),
    paymentDayOfMonth: loanDetails.paymentDayOfMonth,
    lenderName: loanDetails.lenderName,
    accountNumber: loanDetails.accountNumber,
    events: (loanDetails.events ?? []).map(serializeLoanEvent),
    createdAt: loanDetails.createdAt.toISOString(),
    updatedAt: loanDetails.updatedAt.toISOString(),
  };
}

export function serializeLoan({
  loanDetails,
  projection,
  paymentsCount,
}: {
  loanDetails: LoanDetails;
  projection: LoanProjection;
  paymentsCount: number;
}): LoanApiResponse {
  const account = loanDetails.account;
  if (!account) {
    throw new Error('serializeLoan: loanDetails.account is missing — include Accounts in the query');
  }
  return {
    ...serializeAccount(account),
    loanDetails: serializeLoanDetails(loanDetails),
    projection,
    paymentsCount,
  };
}

export function serializeLoans(
  loans: { loanDetails: LoanDetails; projection: LoanProjection; paymentsCount: number }[],
): LoanApiResponse[] {
  return loans.map(serializeLoan);
}
