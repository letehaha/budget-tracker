import { api } from '@/api/_api';
import { PORTFOLIO_TYPE, PortfolioModel } from '@bt/shared/types/investments';

export interface CreatePortfolioRequest {
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
  return api.delete(`/investments/portfolios/${portfolioId}`, { force });
};
