import { api } from '@/api/_api';
import type { HoldingModel, SecuritySearchResult } from '@bt/shared/types/investments';

export type CreateHoldingRequest = {
  portfolioId: number;
  quantity: number;
  costBasis: number;
  accountId?: number;
} & ({ securityId: number } | { searchResult: SecuritySearchResult });

export const getHoldings = async (portfolioId: number): Promise<HoldingModel[]> => {
  const res = await api.get(`/investments/portfolios/${portfolioId}/holdings`);
  return res;
};

export const createHolding = async (payload: CreateHoldingRequest): Promise<HoldingModel> => {
  const res = await api.post('/investments/holding', payload);
  return res;
};

export const deleteHolding = async (holdingId: number): Promise<void> => {
  await api.delete('/investments/holding', { holdingId });
};
