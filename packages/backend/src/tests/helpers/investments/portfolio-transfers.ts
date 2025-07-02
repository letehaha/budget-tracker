import { createPortfolioTransfer as _createPortfolioTransfer } from '@services/investments/portfolios/transfers';

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
