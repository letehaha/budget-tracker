import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { createInvestmentTransaction as _createInvestmentTransaction } from '@services/investments/transactions/create.service';
import { deleteInvestmentTransaction as _deleteInvestmentTransaction } from '@services/investments/transactions/delete.service';
import { getTransactions as _getTransactions } from '@services/investments/transactions/get.service';

import { makeRequest } from '../common';

export function buildInvestmentTransactionPayload({
  accountId,
  securityId,
  category = INVESTMENT_TRANSACTION_CATEGORY.buy,
  date = new Date().toISOString().slice(0, 10),
  quantity = '1',
  price = '100',
  fees = '0',
  name = '',
}): Omit<Parameters<typeof _createInvestmentTransaction>[0], 'userId'> {
  return {
    accountId,
    securityId,
    category,
    date,
    quantity,
    price,
    fees,
    name,
  };
}

export async function createInvestmentTransaction<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload: Partial<ReturnType<typeof buildInvestmentTransactionPayload>> & { accountId: number; securityId: number };
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof _createInvestmentTransaction>>, R>({
    method: 'post',
    url: '/investments/transaction',
    payload: buildInvestmentTransactionPayload(payload),
    raw,
  });
}

export async function getInvestmentTransactions<R extends boolean | undefined = false>({
  accountId,
  securityId,
  category,
  startDate,
  endDate,
  limit,
  offset,
  raw,
}: Omit<Parameters<typeof _getTransactions>[0], 'userId'> & { raw?: R }) {
  const params = new URLSearchParams();

  if (accountId) {
    params.append('accountId', accountId.toString());
  }
  if (securityId) {
    params.append('securityId', securityId.toString());
  }
  if (category) {
    params.append('category', category);
  }
  if (startDate) {
    params.append('startDate', `${startDate}T00:00:00.000Z`);
  }
  if (endDate) {
    params.append('endDate', `${endDate}T23:59:59.999Z`);
  }
  if (limit) {
    params.append('limit', limit.toString());
  }
  if (offset) {
    params.append('offset', offset.toString());
  }

  return makeRequest<Awaited<ReturnType<typeof _getTransactions>>, R>({
    method: 'get',
    url: `/investments/transactions${params.toString() ? `?${params.toString()}` : ''}`,
    raw,
  });
}

export async function deleteInvestmentTransaction<R extends boolean | undefined = false>({
  transactionId,
  raw,
}: {
  transactionId: number;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof _deleteInvestmentTransaction>>, R>({
    method: 'delete',
    url: `/investments/transaction/${transactionId}`,
    raw,
  });
}
