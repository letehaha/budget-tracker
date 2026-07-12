import type { LoanApiResponse, LoanBalanceHistoryPoint } from '@bt/shared/types';

import { makeRequest } from './common';

export async function getLoans<R extends boolean | undefined = undefined>({ raw }: { raw?: R } = {}) {
  return makeRequest<LoanApiResponse[], R>({
    method: 'get',
    url: '/loans',
    raw,
  });
}

export async function getLoanById<R extends boolean | undefined = undefined>({ id, raw }: { id: string; raw?: R }) {
  return makeRequest<LoanApiResponse, R>({
    method: 'get',
    url: `/loans/${id}`,
    raw,
  });
}

export async function getLoanBalanceHistory<R extends boolean | undefined = undefined>({
  id,
  raw,
}: {
  id: string;
  raw?: R;
}) {
  return makeRequest<LoanBalanceHistoryPoint[], R>({
    method: 'get',
    url: `/loans/${id}/balance-history`,
    raw,
  });
}

export async function createLoan<R extends boolean | undefined = undefined>({
  payload,
  raw,
}: {
  payload: Record<string, unknown>;
  raw?: R;
}) {
  return makeRequest<LoanApiResponse, R>({
    method: 'post',
    url: '/loans',
    payload,
    raw,
  });
}

export async function updateLoan<R extends boolean | undefined = undefined>({
  id,
  payload,
  raw,
}: {
  id: string;
  payload: Record<string, unknown>;
  raw?: R;
}) {
  return makeRequest<LoanApiResponse, R>({
    method: 'patch',
    url: `/loans/${id}`,
    payload,
    raw,
  });
}

export async function deleteLoan<R extends boolean | undefined = undefined>({ id, raw }: { id: string; raw?: R }) {
  return makeRequest<undefined, R>({
    method: 'delete',
    url: `/loans/${id}`,
    raw,
  });
}

export async function appendLoanNote<R extends boolean | undefined = undefined>({
  id,
  text,
  raw,
}: {
  id: string;
  text: string;
  raw?: R;
}) {
  return makeRequest<LoanApiResponse, R>({
    method: 'post',
    url: `/loans/${id}/events`,
    payload: { text },
    raw,
  });
}

export async function linkLoanPayments<R extends boolean | undefined = undefined>({
  id,
  transactionIds,
  confirmOverpay,
  raw,
}: {
  id: string;
  transactionIds: string[];
  confirmOverpay?: boolean;
  raw?: R;
}) {
  return makeRequest<{ loan: LoanApiResponse; linkedCount: number }, R>({
    method: 'post',
    url: `/loans/${id}/link-payments`,
    payload: { transactionIds, confirmOverpay },
    raw,
  });
}

export async function unlinkLoanPayment<R extends boolean | undefined = undefined>({
  id,
  transactionId,
  raw,
}: {
  id: string;
  transactionId: string;
  raw?: R;
}) {
  return makeRequest<{ loan: LoanApiResponse; restoredTransactionId: string }, R>({
    method: 'post',
    url: `/loans/${id}/unlink-payment`,
    payload: { transactionId },
    raw,
  });
}

export function buildCreateLoanPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test loan',
    currencyCode: 'USD',
    initialBalance: 200_000,
    loanType: 'mortgage',
    originalPrincipal: 200_000,
    interestRate: 6,
    termMonths: 360,
    startDate: '2020-06-15',
    plannedPayment: 1_200,
    minPayment: 1_200,
    paymentDayOfMonth: 15,
    lenderName: 'Chase',
    accountNumber: '4521',
    ...overrides,
  };
}
