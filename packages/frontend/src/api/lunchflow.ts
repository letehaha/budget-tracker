import { api } from '@/api/_api';
import { AccountModel } from '@bt/shared/types';

export interface LunchFlowAccount {
  id: number;
  name: string;
  institution_name: string;
  institution_logo: string;
  provider: 'gocardless';
  currency: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface StoreApiKeyPayload {
  apiKey: string;
}

export interface SyncAccountsResponse {
  message: string;
  newCount: number;
  totalCount: number;
  accounts: AccountModel[];
}

export interface SyncTransactionsResponse {
  message: string;
  total: number;
  new: number;
}

export interface RefreshBalanceResponse {
  message: string;
  balance: number;
  currency: string;
}

/**
 * Store and validate Lunch Flow API key
 */
export const storeApiKey = async (payload: StoreApiKeyPayload): Promise<{ message: string }> =>
  api.post('/banks/lunchflow/store-api-key', payload);

/**
 * Get accounts from Lunch Flow API (not from our DB)
 */
export const getAccounts = async (): Promise<{ accounts: LunchFlowAccount[] }> => api.get('/banks/lunchflow/accounts');

/**
 * Sync accounts from Lunch Flow to our database
 */
export const syncAccounts = async (): Promise<SyncAccountsResponse> => api.post('/banks/lunchflow/sync-accounts');

/**
 * Sync transactions for a specific account
 */
export const syncTransactions = async (accountId: number): Promise<SyncTransactionsResponse> =>
  api.post('/banks/lunchflow/sync-transactions', { accountId });

/**
 * Refresh account balance
 */
export const refreshBalance = async (accountId: number): Promise<RefreshBalanceResponse> =>
  api.post('/banks/lunchflow/refresh-balance', { accountId });

/**
 * Remove Lunch Flow connection
 */
export const removeConnection = async (): Promise<{ message: string }> => api.delete('/banks/lunchflow/disconnect');
