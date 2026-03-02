import {
  accountToPortfolioTransfer as _accountToPortfolioTransfer,
  createPortfolioTransfer as _createPortfolioTransfer,
  deletePortfolioTransfer as _deletePortfolioTransfer,
  directCashTransaction as _directCashTransaction,
  listPortfolioTransfers as _listPortfolioTransfers,
  portfolioToAccountTransfer as _portfolioToAccountTransfer,
} from '@services/investments/portfolios/transfers';

import { makeRequest } from '../common';

export function buildPortfolioTransferPayload({
  toPortfolioId,
  currencyCode,
  amount = '100',
  date = new Date().toISOString().slice(0, 10),
  description = 'Test portfolio transfer',
}: {
  toPortfolioId: number;
  currencyCode: string;
  amount?: string;
  date?: string;
  description?: string | null;
}) {
  return {
    toPortfolioId,
    currencyCode,
    amount,
    date,
    description,
  };
}

export async function createPortfolioTransfer<R extends boolean | undefined = false>({
  fromPortfolioId,
  payload,
  raw,
}: {
  fromPortfolioId: number;
  payload: ReturnType<typeof buildPortfolioTransferPayload>;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof _createPortfolioTransfer>>, R>({
    method: 'post',
    url: `/investments/portfolios/${fromPortfolioId}/transfer`,
    payload,
    raw,
  });
}

export async function listPortfolioTransfers<R extends boolean | undefined = false>({
  portfolioId,
  raw,
  ...payload
}: {
  portfolioId: number;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  page?: number;
  sortBy?: 'date' | 'amount';
  sortDirection?: 'ASC' | 'DESC';
  raw?: R;
}) {
  const url = `/investments/portfolios/${portfolioId}/transfers`;

  return makeRequest<
    {
      data: Awaited<ReturnType<typeof _listPortfolioTransfers>>['data'];
      pagination: { limit: number; offset: number; page: number; totalCount: number };
    },
    R
  >({
    method: 'get',
    url,
    payload,
    raw,
  });
}

export async function accountToPortfolioTransfer<R extends boolean | undefined = false>({
  portfolioId,
  payload,
  raw,
}: {
  portfolioId: number;
  payload: {
    accountId: number;
    amount: string;
    date: string;
    description?: string | null;
  };
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof _accountToPortfolioTransfer>>, R>({
    method: 'post',
    url: `/investments/portfolios/${portfolioId}/transfer/from-account`,
    payload,
    raw,
  });
}

export async function portfolioToAccountTransfer<R extends boolean | undefined = false>({
  portfolioId,
  payload,
  raw,
}: {
  portfolioId: number;
  payload: {
    accountId: number;
    amount: string;
    currencyCode: string;
    date: string;
    description?: string | null;
    existingTransactionId?: number;
  };
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof _portfolioToAccountTransfer>>, R>({
    method: 'post',
    url: `/investments/portfolios/${portfolioId}/transfer/to-account`,
    payload,
    raw,
  });
}

export async function deletePortfolioTransfer<R extends boolean | undefined = false>({
  portfolioId,
  transferId,
  deleteLinkedTransaction,
  raw,
}: {
  portfolioId: number;
  transferId: number;
  deleteLinkedTransaction?: boolean;
  raw?: R;
}) {
  const query = deleteLinkedTransaction !== undefined ? `?deleteLinkedTransaction=${deleteLinkedTransaction}` : '';

  return makeRequest<Awaited<ReturnType<typeof _deletePortfolioTransfer>>, R>({
    method: 'delete',
    url: `/investments/portfolios/${portfolioId}/transfers/${transferId}${query}`,
    raw,
  });
}

export async function directCashTransaction<R extends boolean | undefined = false>({
  portfolioId,
  payload,
  raw,
}: {
  portfolioId: number;
  payload: {
    type: 'deposit' | 'withdrawal';
    amount: string;
    currencyCode: string;
    date: string;
    description?: string | null;
  };
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof _directCashTransaction>>, R>({
    method: 'post',
    url: `/investments/portfolios/${portfolioId}/cash-transaction`,
    payload,
    raw,
  });
}
