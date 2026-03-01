import { api } from '@/api/_api';
import {
  PORTFOLIO_TYPE,
  PortfolioBalanceModel,
  PortfolioModel,
  PortfolioTransferModel,
} from '@bt/shared/types/investments';
import type { PortfolioSummaryModel } from '@bt/shared/types/investments/portfolio-summary.model';

interface CreatePortfolioRequest {
  name: string;
  portfolioType?: PORTFOLIO_TYPE;
  description?: string;
  isEnabled?: boolean;
}

export const createPortfolio = async (params: CreatePortfolioRequest): Promise<PortfolioModel> => {
  const result = await api.post('/investments/portfolios', params);
  return result;
};

export const getPortfolios = async (): Promise<PortfolioModel[]> => {
  const result = await api.get('/investments/portfolios');
  return result.data;
};

export const getPortfolio = async ({ portfolioId }: { portfolioId: number }): Promise<PortfolioModel> => {
  const result = await api.get(`/investments/portfolios/${portfolioId}`);
  return result;
};

type UpdatePortfolioParams = {
  portfolioId: number;
} & Partial<Omit<CreatePortfolioRequest, 'portfolioType'> & { portfolioType: PORTFOLIO_TYPE }>;

export const updatePortfolio = async ({ portfolioId, ...params }: UpdatePortfolioParams): Promise<PortfolioModel> => {
  const result = await api.put(`/investments/portfolios/${portfolioId}`, params);
  return result;
};

export const deletePortfolio = async ({
  portfolioId,
  force,
}: {
  portfolioId: number;
  force?: boolean;
}): Promise<void> => {
  return api.delete(`/investments/portfolios/${portfolioId}`, { data: { force } });
};

interface CreatePortfolioTransferRequest {
  toPortfolioId: number;
  currencyCode: string;
  amount: string;
  date: string;
  description?: string;
}

type CreatePortfolioTransferParams = { fromPortfolioId: number } & CreatePortfolioTransferRequest;

export const createPortfolioTransfer = async ({
  fromPortfolioId,
  ...params
}: CreatePortfolioTransferParams): Promise<PortfolioTransferModel> => {
  const result = await api.post(`/investments/portfolios/${fromPortfolioId}/transfer`, params);
  return result;
};

interface AccountToPortfolioTransferRequest {
  accountId: number;
  amount: string;
  date: string;
  description?: string;
}

type AccountToPortfolioTransferParams = { portfolioId: number } & AccountToPortfolioTransferRequest;

export const accountToPortfolioTransfer = async ({
  portfolioId,
  ...params
}: AccountToPortfolioTransferParams): Promise<PortfolioTransferModel> => {
  const result = await api.post(`/investments/portfolios/${portfolioId}/transfer/from-account`, params);
  return result;
};

interface PortfolioToAccountTransferRequest {
  accountId: number;
  amount: string;
  currencyCode: string;
  date: string;
  description?: string;
}

type PortfolioToAccountTransferParams = { portfolioId: number } & PortfolioToAccountTransferRequest;

export const portfolioToAccountTransfer = async ({
  portfolioId,
  ...params
}: PortfolioToAccountTransferParams): Promise<PortfolioTransferModel> => {
  const result = await api.post(`/investments/portfolios/${portfolioId}/transfer/to-account`, params);
  return result;
};

export const getPortfolioBalances = async ({
  portfolioId,
}: {
  portfolioId: number;
}): Promise<PortfolioBalanceModel[]> => {
  const result = await api.get(`/investments/portfolios/${portfolioId}/balance`);
  return result;
};

export const getPortfolioTransfers = async ({
  portfolioId,
}: {
  portfolioId: number;
}): Promise<PortfolioTransferModel[]> => {
  const result = await api.get(`/investments/portfolios/${portfolioId}/transfers`);
  return result.data;
};

interface DirectCashTransactionRequest {
  type: 'deposit' | 'withdrawal';
  amount: string;
  currencyCode: string;
  date: string;
  description?: string | null;
}

type DirectCashTransactionParams = { portfolioId: number } & DirectCashTransactionRequest;

export const createDirectCashTransaction = async ({
  portfolioId,
  ...params
}: DirectCashTransactionParams): Promise<PortfolioTransferModel> => {
  const result = await api.post(`/investments/portfolios/${portfolioId}/cash-transaction`, params);
  return result;
};

export const deletePortfolioTransfer = async ({
  portfolioId,
  transferId,
  deleteLinkedTransaction,
}: {
  portfolioId: number;
  transferId: number;
  deleteLinkedTransaction?: boolean;
}): Promise<void> => {
  const query: Record<string, string> = {};
  if (deleteLinkedTransaction !== undefined) {
    query.deleteLinkedTransaction = String(deleteLinkedTransaction);
  }
  return api.delete(`/investments/portfolios/${portfolioId}/transfers/${transferId}`, { query });
};

export const getPortfolioSummary = async ({
  portfolioId,
  date,
}: {
  portfolioId: number;
  date?: string;
}): Promise<PortfolioSummaryModel> => {
  const params = date ? { date } : {};
  const result = await api.get(`/investments/portfolios/${portfolioId}/summary`, params);
  return result;
};
