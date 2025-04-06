import { api } from '@/api/_api';
import { AccountModel, MonobankUserModel, endpointsTypes } from '@bt/shared/types';

export const loadMonoUser = async (): Promise<MonobankUserModel> => {
  const result = await api.get('/banks/monobank/user');

  return result;
};

export const refreshMonoAccounts = async (): Promise<AccountModel[]> => api.get('/banks/monobank/refresh-accounts');

export const loadMonoTransactions = async (
  payload: endpointsTypes.LoadMonoTransactionsQuery,
): Promise<endpointsTypes.LoadMonoTransactionsResponse> => api.get('/banks/monobank/load-transactions', payload);

export const updateMonoWebhook = async (payload: endpointsTypes.UpdateWebhookBody): Promise<void> =>
  api.post('/banks/monobank/update-webhook', payload);

export const updateMonoUser = async (payload: endpointsTypes.UpdateMonobankUserBody): Promise<MonobankUserModel> =>
  api.post('/banks/monobank/user', payload);

export const pairMonoAccount = async (payload: endpointsTypes.PairMonobankAccountBody): Promise<void> =>
  api.post('/banks/monobank/pair-user', payload);
