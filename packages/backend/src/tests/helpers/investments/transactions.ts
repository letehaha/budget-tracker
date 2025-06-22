import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { createInvestmentTransaction as _createInvestmentTransaction } from '@services/investments/transactions/create.service';

import { makeRequest } from '../common';

interface BuildInvestmentTransactionPayload {
  accountId: number;
  securityId: number;
  category?: INVESTMENT_TRANSACTION_CATEGORY;
  date?: string;
  quantity?: string;
  price?: string;
  fees?: string;
  name?: string;
}

export function buildInvestmentTransactionPayload({
  accountId,
  securityId,
  category = INVESTMENT_TRANSACTION_CATEGORY.buy,
  date = new Date().toISOString().slice(0, 10),
  quantity = '1',
  price = '100',
  fees = '0',
  name,
}: BuildInvestmentTransactionPayload) {
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
  payload: ReturnType<typeof buildInvestmentTransactionPayload>;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof _createInvestmentTransaction>>, R>({
    method: 'post',
    url: '/investments/transaction',
    payload,
    raw,
  });
}
