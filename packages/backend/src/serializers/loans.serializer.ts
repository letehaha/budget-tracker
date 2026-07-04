import {
  type LoanApiResponse,
  type LoanDetailsApiResponse,
  type LoanEvent,
  type LoanEventApi,
  type LoanProjection,
} from '@bt/shared/types';
import { centsToApiDecimal } from '@common/types/money';
import type LoanDetails from '@models/loan-details.model';
import { serializeAccount } from '@root/serializers/accounts.serializer';

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
    case 'rate_change':
    case 'term_change':
    case 'note':
    case 'paid_off':
      // No cents fields — the wire shape is identical, so pass the event through.
      return event;
    default: {
      // A new event type that carries cents must add a case above; the never
      // assignment fails to compile until it does.
      const unhandled: never = event;
      throw new Error(`serializeLoanEvent: unhandled loan event ${JSON.stringify(unhandled)}`);
    }
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
