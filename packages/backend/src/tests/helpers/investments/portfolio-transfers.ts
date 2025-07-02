import { createPortfolioTransfer as _createPortfolioTransfer } from '@services/investments/portfolios/transfers';
import { listPortfolioTransfers as _listPortfolioTransfers } from '@services/investments/portfolios/transfers';

import { makeRequest } from '../common';

export function buildPortfolioTransferPayload({
  toPortfolioId,
  currencyId,
  amount = '100',
  date = new Date().toISOString().slice(0, 10),
  description = 'Test portfolio transfer',
}: {
  toPortfolioId: number;
  currencyId: number;
  amount?: string;
  date?: string;
  description?: string | null;
}) {
  return {
    toPortfolioId,
    currencyId,
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
