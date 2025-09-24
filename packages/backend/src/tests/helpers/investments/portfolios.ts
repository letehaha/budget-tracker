import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { removeUndefinedKeys } from '@js/helpers';
import { getPortfolioBalances as _getPortfolioBalances } from '@services/investments/portfolios/balances';
import { updatePortfolioBalance as _updatePortfolioBalance } from '@services/investments/portfolios/balances';
import { createPortfolio as _createPortfolio } from '@services/investments/portfolios/create.service';
import { deletePortfolio as _deletePortfolio } from '@services/investments/portfolios/delete.service';
import { getPortfolio as _getPortfolio } from '@services/investments/portfolios/get.service';
import { listPortfolios as _listPortfolios } from '@services/investments/portfolios/list.service';
import { updatePortfolio as _updatePortfolio } from '@services/investments/portfolios/update.service';

import { makeRequest } from '../common';

export function buildPortfolioPayload({
  name = 'Test Portfolio',
  portfolioType = PORTFOLIO_TYPE.investment,
  description = 'Test portfolio description',
  isEnabled = true,
}: Partial<Omit<Parameters<typeof _createPortfolio>[0], 'userId'>> = {}): Omit<
  Parameters<typeof _createPortfolio>[0],
  'userId'
> {
  return {
    name,
    portfolioType,
    description,
    isEnabled,
  };
}

export async function createPortfolio<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload?: Partial<ReturnType<typeof buildPortfolioPayload>>;
  raw?: R;
} = {}) {
  return makeRequest<Awaited<ReturnType<typeof _createPortfolio>>, R>({
    method: 'post',
    url: '/investments/portfolios',
    payload: buildPortfolioPayload(payload),
    raw,
  });
}

export async function listPortfolios<R extends boolean | undefined = false>({
  portfolioType,
  isEnabled,
  limit,
  offset,
  page,
  raw,
}: {
  portfolioType?: PORTFOLIO_TYPE;
  isEnabled?: boolean;
  limit?: number;
  offset?: number;
  page?: number;
  raw?: R;
} = {}) {
  return makeRequest<
    { data: Awaited<ReturnType<typeof _listPortfolios>>; pagination: { limit: number; offset: number; page: number } },
    R
  >({
    method: 'get',
    url: '/investments/portfolios',
    payload: removeUndefinedKeys({ portfolioType, isEnabled, limit, offset, page }),
    raw,
  });
}

export async function getPortfolio<R extends boolean | undefined = false>({
  portfolioId,
  raw,
}: {
  portfolioId: number;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof _getPortfolio>>, R>({
    method: 'get',
    url: `/investments/portfolios/${portfolioId}`,
    raw,
  });
}

export async function getPortfolioBalance<R extends boolean | undefined = false>({
  portfolioId,
  currencyCode,
  raw,
}: {
  portfolioId: number;
  currencyCode?: string;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof _getPortfolioBalances>>, R>({
    method: 'get',
    url: `/investments/portfolios/${portfolioId}/balance`,
    payload: removeUndefinedKeys({ currencyCode }),
    raw,
  });
}

export async function updatePortfolio<R extends boolean | undefined = false>({
  portfolioId,
  payload,
  raw,
}: {
  portfolioId: number;
  payload: Partial<ReturnType<typeof buildPortfolioPayload>>;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof _updatePortfolio>>, R>({
    method: 'put',
    url: `/investments/portfolios/${portfolioId}`,
    payload,
    raw,
  });
}

export async function deletePortfolio<R extends boolean | undefined = false>({
  portfolioId,
  force,
  raw,
}: {
  portfolioId: number;
  force?: boolean;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof _deletePortfolio>>, R>({
    method: 'delete',
    url: `/investments/portfolios/${portfolioId}`,
    payload: removeUndefinedKeys({ force }),
    raw,
  });
}

export async function updatePortfolioBalance<R extends boolean | undefined = false>({
  portfolioId,
  currencyCode,
  availableCashDelta,
  totalCashDelta,
  setAvailableCash,
  setTotalCash,
  raw,
}: {
  portfolioId: number;
  currencyCode: string;
  availableCashDelta?: string;
  totalCashDelta?: string;
  setAvailableCash?: string;
  setTotalCash?: string;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof _updatePortfolioBalance>>, R>({
    method: 'put',
    url: `/investments/portfolios/${portfolioId}/balance`,
    payload: removeUndefinedKeys({
      currencyCode,
      availableCashDelta,
      totalCashDelta,
      setAvailableCash,
      setTotalCash,
    }),
    raw,
  });
}
