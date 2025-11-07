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

export function syncTransactionsForAccount<R extends boolean | undefined = false>({
  connectionId,
  accountId,
  raw,
}: {
  connectionId: number;
  accountId: number;
  raw?: R;
}) {
  return makeRequest<
    {
      jobGroupId?: string;
      totalBatches?: number;
      estimatedMinutes?: number;
      message: string;
    },
    R
  >({
    method: 'post',
    url: `/bank-data-providers/connections/${connectionId}/sync-transactions`,
    payload: {
      accountId,
    },
    raw,
  });
}

export function loadTransactionsForPeriod<R extends boolean | undefined = false>({
  connectionId,
  accountId,
  from,
  to,
  raw,
}: {
  connectionId: number;
  accountId: number;
  from: string;
  to: string;
  raw?: R;
}) {
  return makeRequest<
    {
      jobGroupId: string;
      totalBatches: number;
      estimatedMinutes: number;
      message: string;
    },
    R
  >({
    method: 'post',
    url: `/bank-data-providers/connections/${connectionId}/load-transactions-for-period`,
    payload: {
      accountId,
      from,
      to,
    },
    raw,
  });
}

export function getSyncJobProgress<R extends boolean | undefined = false>({
  connectionId,
  jobGroupId,
  raw,
}: {
  connectionId: number;
  jobGroupId: string;
  raw?: R;
}) {
  return makeRequest<
    {
      totalBatches: number;
      completedBatches: number;
      failedBatches: number;
      activeBatches: number;
      waitingBatches: number;
      status: 'waiting' | 'active' | 'completed' | 'failed' | 'partial';
    },
    R
  >({
    method: 'get',
    url: `/bank-data-providers/connections/${connectionId}/sync-job-progress?jobGroupId=${jobGroupId}`,
    raw,
  });
}

/**
 * Wait for transaction sync jobs to complete
 * Polls the job status until completed or failed
 */
export async function waitForSyncJobsToComplete({
  connectionId,
  jobGroupId,
  timeoutMs = 30000,
  pollIntervalMs = 500,
}: {
  connectionId: number;
  jobGroupId: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<{
  status: 'completed' | 'failed' | 'partial';
  completedBatches: number;
  failedBatches: number;
  totalBatches: number;
}> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const progress = await getSyncJobProgress({ connectionId, jobGroupId, raw: true });

    if (progress.status === 'completed' || progress.status === 'failed' || progress.status === 'partial') {
      return {
        status: progress.status,
        completedBatches: progress.completedBatches,
        failedBatches: progress.failedBatches,
        totalBatches: progress.totalBatches,
      };
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Sync jobs did not complete within ${timeoutMs}ms`);
}

export default {
  getSupportedBankProviders,
  connectProvider,
  listUserConnections,
  getConnectionDetails,
  listExternalAccounts,
  connectSelectedAccounts,
  syncTransactionsForAccount,
  loadTransactionsForPeriod,
  getSyncJobProgress,
  waitForSyncJobsToComplete,
};
