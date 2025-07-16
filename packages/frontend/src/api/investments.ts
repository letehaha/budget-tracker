import { api } from '@/api/_api';
import { HoldingModel } from '@bt/shared/types/investments';

export const loadHoldings = async (accountId: number): Promise<HoldingModel[]> => {
  const result: HoldingModel[] = await api.get(`/investments/accounts/${accountId}/holdings`);
  return result;
};

/** @public */
export const createHolding = async (payload: { accountId: number; securityId: number }): Promise<HoldingModel> => {
  const result: HoldingModel = await api.post('/investments/holding', payload);
  return result;
};

export const deleteHolding = async (payload: { accountId: number; securityId: number }): Promise<void> => {
  await api.delete('/investments/holding', { data: payload });
};
