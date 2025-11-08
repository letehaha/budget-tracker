import { api } from '@/api/_api';

import { fromSystemAmount } from './helpers';

export interface BankProvider {
  type: string;
  name: string;
  description: string;
  logoUrl?: string;
  documentationUrl?: string;
  features: {
    supportsAccountSync: boolean;
    supportsTransactionSync: boolean;
    supportsBalanceUpdates: boolean;
    supportsWebhooks: boolean;
    supportsManualSync: boolean;
    supportsAutoSync: boolean;
    supportsRealtime: boolean;
    requiresReauth: boolean;
    defaultSyncInterval: number;
    minSyncInterval: number;
  };
  credentialFields: Array<{
    key: string;
    label: string;
    type: 'text' | 'password';
    required: boolean;
    helpText?: string;
  }>;
}

export interface BankConnection {
  id: number;
  providerType: string;
  providerName: string;
  isActive: boolean;
  lastSyncAt: string | null;
  accountsCount: number;
  createdAt: string;
}

interface BankConnectionDetails {
  id: number;
  providerType: string;
  providerName: string;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
  provider: {
    name: string;
    description: string;
    logoUrl?: string;
    documentationUrl?: string;
    features: {
      supportsWebhooks: boolean;
      supportsRealtime: boolean;
      requiresReauth: boolean;
      supportsManualSync: boolean;
      supportsAutoSync: boolean;
      defaultSyncInterval?: number;
      minSyncInterval?: number;
    };
  };
  accounts: Array<{
    id: number;
    name: string;
    externalId: string;
    currentBalance: number;
    currencyCode: string;
    type: string;
  }>;
}

export interface AvailableAccount {
  externalId: string;
  name: string;
  type: string;
  balance: number;
  currency: string;
  metadata?: Record<string, unknown>;
}

interface SyncedAccount {
  id: number;
  externalId: string;
  name: string;
  balance: number;
  currency: string;
}

export const listProviders = async (): Promise<BankProvider[]> => {
  const response = await api.get<{ providers: BankProvider[] }>('/bank-data-providers');
  return response.providers;
};

export const listConnections = async (): Promise<BankConnection[]> => {
  const response = await api.get<{ connections: BankConnection[] }>('/bank-data-providers/connections');
  return response.connections;
};

export const getConnectionDetails = async (connectionId: number): Promise<BankConnectionDetails> => {
  const response = await api.get<{ connection: BankConnectionDetails }>(
    `/bank-data-providers/connections/${connectionId}`,
  );

  return {
    ...response.connection,
    accounts: response.connection.accounts.map((acc) => ({
      ...acc,
      currentBalance: fromSystemAmount(acc.currentBalance),
    })),
  };
};

export const connectProvider = async (
  providerType: string,
  credentials: Record<string, unknown>,
  providerName?: string,
): Promise<{ connectionId: number; message: string }> => {
  const response = await api.post(`/bank-data-providers/${providerType}/connect`, {
    credentials,
    providerName,
  });
  return response;
};

export const disconnectProvider = async ({
  connectionId,
  removeAssociatedAccounts = false,
}: {
  connectionId: number;
  removeAssociatedAccounts?: boolean;
}): Promise<{ message: string }> => {
  const response = await api.delete(`/bank-data-providers/connections/${connectionId}`, {
    query: { removeAssociatedAccounts },
  });
  return response;
};

export const getAvailableAccounts = async (connectionId: number): Promise<AvailableAccount[]> => {
  const response = await api.get<{ accounts: AvailableAccount[] }>(
    `/bank-data-providers/connections/${connectionId}/available-accounts`,
  );
  console.log('response.accounts', response.accounts);
  return response.accounts.map((item) => ({
    ...item,
    balance: fromSystemAmount(item.balance),
    metadata: {
      ...item.metadata,
      creditLimit: fromSystemAmount(item.metadata.creditLimit),
    },
  }));
};

export const syncSelectedAccounts = async (
  connectionId: number,
  accountExternalIds: string[],
): Promise<{ syncedAccounts: SyncedAccount[]; message: string }> => {
  const response = await api.post(`/bank-data-providers/connections/${connectionId}/sync-selected-accounts`, {
    accountExternalIds,
  });
  return response;
};

export interface SyncJobResult {
  jobGroupId: string;
  totalBatches: number;
  estimatedMinutes: number;
  message: string;
}

export interface JobProgress {
  totalBatches: number;
  completedBatches: number;
  failedBatches: number;
  activeBatches: number;
  waitingBatches: number;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'partial';
  progress?: unknown;
}

export const syncTransactions = async (
  connectionId: number,
  accountId: number,
): Promise<{ message: string } | SyncJobResult> => {
  const response = await api.post(`/bank-data-providers/connections/${connectionId}/sync-transactions`, {
    accountId,
  });
  return response;
};

export const loadTransactionsForPeriod = async (
  connectionId: number,
  accountId: number,
  from: string,
  to: string,
): Promise<SyncJobResult> => {
  const response = await api.post(`/bank-data-providers/connections/${connectionId}/load-transactions-for-period`, {
    accountId,
    from,
    to,
  });
  return response;
};

export const getSyncJobProgress = async (connectionId: number, jobGroupId: string): Promise<JobProgress> => {
  const response = await api.get<JobProgress>(
    `/bank-data-providers/connections/${connectionId}/sync-job-progress?jobGroupId=${encodeURIComponent(jobGroupId)}`,
  );
  return response;
};

interface ActiveSyncJob {
  jobGroupId: string;
  connectionId: number;
  accountId: number;
  status: 'waiting' | 'active';
}

export const getActiveSyncJobs = async (): Promise<ActiveSyncJob[]> => {
  const response = await api.get<{ jobs: ActiveSyncJob[] }>('/bank-data-providers/active-sync-jobs');
  return response.jobs;
};
