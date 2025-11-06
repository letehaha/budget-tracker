import { ListExternalAccountsResponseData } from '@controllers/bank-data-providers/connections/list-external-accounts';
import * as connectProviderService from '@services/bank-data-providers/connection/connect-provider';
import * as getConnectionDetailsService from '@services/bank-data-providers/connection/get-connection-details';
import * as listUserConnectionsService from '@services/bank-data-providers/connection/list-user-connections';
import { listSupportedProviders } from '@services/bank-data-providers/list-supported-providers.service';
import { BankProviderType } from '@services/bank-data-providers/types';

import { MakeRequestReturn, UtilizeReturnType, makeRequest } from './common';

export function getSupportedBankProviders<R extends boolean | undefined = false>({ raw }: { raw?: R } = {}) {
  return makeRequest<{ providers: Awaited<ReturnType<typeof listSupportedProviders>> }, R>({
    method: 'get',
    url: '/bank-data-providers',
    raw,
  });
}

export function connectProvider<R extends boolean | undefined = false>({
  providerType,
  credentials,
  providerName,
  raw,
}: {
  providerType: BankProviderType;
  credentials: Record<string, unknown>;
  providerName?: string;
  raw?: R;
}): UtilizeReturnType<typeof connectProviderService.connectProvider, R> {
  return makeRequest<Awaited<ReturnType<typeof connectProviderService.connectProvider>>, R>({
    method: 'post',
    url: `/bank-data-providers/${providerType}/connect`,
    payload: {
      credentials,
      ...(providerName && { providerName }),
    },
    raw,
  });
}

export function listUserConnections<R extends boolean | undefined = false>({
  raw,
}: {
  raw?: R;
} = {}) {
  return makeRequest<{ connections: Awaited<ReturnType<typeof listUserConnectionsService.listUserConnections>> }, R>({
    method: 'get',
    url: '/bank-data-providers/connections',
    raw,
  });
}

export function getConnectionDetails<R extends boolean | undefined = false>({
  connectionId,
  raw,
}: {
  connectionId: number;
  raw?: R;
}) {
  return makeRequest<{ connection: Awaited<ReturnType<typeof getConnectionDetailsService.getConnectionDetails>> }, R>({
    method: 'get',
    url: `/bank-data-providers/connections/${connectionId}`,
    raw,
  });
}

export function listExternalAccounts<R extends boolean | undefined = false>({
  connectionId,
  raw,
}: {
  connectionId: number;
  raw?: R;
}): Promise<MakeRequestReturn<ListExternalAccountsResponseData, R>> {
  return makeRequest<ListExternalAccountsResponseData, R>({
    method: 'get',
    url: `/bank-data-providers/connections/${connectionId}/available-accounts`,
    raw,
  });
}

export function connectSelectedAccounts<R extends boolean | undefined = false>({
  connectionId,
  accountExternalIds,
  raw,
}: {
  connectionId: number;
  accountExternalIds: string[];
  raw?: R;
}) {
  return makeRequest<
    {
      syncedAccounts: {
        id: number;
        externalId: string;
        name: string;
        balance: number;
        currency: string;
      }[];
      message: string;
    },
    R
  >({
    method: 'post',
    url: `/bank-data-providers/connections/${connectionId}/sync-selected-accounts`,
    payload: {
      accountExternalIds,
    },
    raw,
  });
}

export default {
  getSupportedBankProviders,
  connectProvider,
  listUserConnections,
  getConnectionDetails,
  listExternalAccounts,
  connectSelectedAccounts,
};
