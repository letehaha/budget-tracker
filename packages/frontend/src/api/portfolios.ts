import { api } from '@/api/_api';
import { PORTFOLIO_TYPE, PortfolioModel, PortfolioTransferModel } from '@bt/shared/types/investments';
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

export const getPortfolio = async (portfolioId: number): Promise<PortfolioModel> => {
  const result = await api.get(`/investments/portfolios/${portfolioId}`);
  return result;
};

export const updatePortfolio = async (
  portfolioId: number,
  params: Partial<Omit<CreatePortfolioRequest, 'portfolioType'> & { portfolioType: PORTFOLIO_TYPE }>,
): Promise<PortfolioModel> => {
  const result = await api.put(`/investments/portfolios/${portfolioId}`, params);
  return result;
};

export const deletePortfolio = async (portfolioId: number, force?: boolean): Promise<void> => {
  return api.delete(`/investments/portfolios/${portfolioId}`, { data: { force } });
};

interface CreatePortfolioTransferRequest {
  toPortfolioId: number;
  currencyCode: string;
  amount: string;
  date: string;
  description?: string;
}

export const createPortfolioTransfer = async (
  fromPortfolioId: number,
  params: CreatePortfolioTransferRequest,
): Promise<PortfolioTransferModel> => {
  const result = await api.post(`/investments/portfolios/${fromPortfolioId}/transfer`, params);
  return result;
};

export const getPortfolioTransfers = async (portfolioId: number): Promise<PortfolioTransferModel[]> => {
  const result = await api.get(`/investments/portfolios/${portfolioId}/transfers`);
  return result.data;
};

export const getPortfolioSummary = async (portfolioId: number, date?: string): Promise<PortfolioSummaryModel> => {
  try {
    const params = date ? { date } : {};
    const result = await api.get(`/investments/portfolios/${portfolioId}/summary`, params);
    return result;
  } catch (error) {
    console.error('Portfolio summary API error:', error);
    throw error;
  }
};
