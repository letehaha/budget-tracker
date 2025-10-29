import * as getAccountsService from '@services/banks/lunchflow/get-accounts';
import * as refreshBalanceService from '@services/banks/lunchflow/refresh-balance';
import * as removeConnectionService from '@services/banks/lunchflow/remove-connection';
import * as storeApiKeyService from '@services/banks/lunchflow/store-api-key';
import * as syncAccountsService from '@services/banks/lunchflow/sync-accounts';
import * as syncTransactionsService from '@services/banks/lunchflow/sync-transactions';
import { VALID_LUNCHFLOW_API_KEY } from '@tests/mocks/lunchflow/data';

import { UtilizeReturnType, makeRequest } from './common';

export function storeLunchflowApiKey<R extends boolean | undefined = false>({
  apiKey = VALID_LUNCHFLOW_API_KEY,
  raw,
}: {
  apiKey?: string;
  raw?: R;
}): UtilizeReturnType<typeof storeApiKeyService.storeApiKey, R> {
  return makeRequest<Awaited<ReturnType<typeof storeApiKeyService.storeApiKey>>, R>({
    method: 'post',
    url: '/banks/lunchflow/store-api-key',
    payload: { apiKey },
    raw,
  });
}

export function getLunchflowAccounts<R extends boolean | undefined = false>({
  raw,
}: {
  raw?: R;
} = {}): UtilizeReturnType<typeof getAccountsService.getAccounts, R> {
  return makeRequest<Awaited<ReturnType<typeof getAccountsService.getAccounts>>, R>({
    method: 'get',
    url: '/banks/lunchflow/accounts',
    raw,
  });
}

export function syncLunchflowAccounts<R extends boolean | undefined = false>({
  raw,
}: {
  raw?: R;
} = {}): UtilizeReturnType<typeof syncAccountsService.syncAccounts, R> {
  return makeRequest<Awaited<ReturnType<typeof syncAccountsService.syncAccounts>>, R>({
    method: 'post',
    url: '/banks/lunchflow/sync-accounts',
    raw,
  });
}

export function syncLunchflowTransactions<R extends boolean | undefined = false>({
  accountId,
  raw,
}: {
  accountId: number;
  raw?: R;
}): UtilizeReturnType<typeof syncTransactionsService.syncTransactions, R> {
  return makeRequest<Awaited<ReturnType<typeof syncTransactionsService.syncTransactions>>, R>({
    method: 'post',
    url: '/banks/lunchflow/sync-transactions',
    payload: { accountId },
    raw,
  });
}

export function refreshLunchflowBalance<R extends boolean | undefined = false>({
  accountId,
  raw,
}: {
  accountId: number;
  raw?: R;
}): UtilizeReturnType<typeof refreshBalanceService.refreshBalance, R> {
  return makeRequest<Awaited<ReturnType<typeof refreshBalanceService.refreshBalance>>, R>({
    method: 'post',
    url: `/banks/lunchflow/refresh-balance?accountId=${accountId}`,
    raw,
  });
}

export function removeLunchflowConnection<R extends boolean | undefined = false>({
  raw,
}: {
  raw?: R;
} = {}): UtilizeReturnType<typeof removeConnectionService.removeConnection, R> {
  return makeRequest<Awaited<ReturnType<typeof removeConnectionService.removeConnection>>, R>({
    method: 'delete',
    url: '/banks/lunchflow/disconnect',
    raw,
  });
}

export default {
  storeApiKey: storeLunchflowApiKey,
  getAccounts: getLunchflowAccounts,
  syncAccounts: syncLunchflowAccounts,
  syncTransactions: syncLunchflowTransactions,
  refreshBalance: refreshLunchflowBalance,
  removeConnection: removeLunchflowConnection,
  validApiKey: VALID_LUNCHFLOW_API_KEY,
};
