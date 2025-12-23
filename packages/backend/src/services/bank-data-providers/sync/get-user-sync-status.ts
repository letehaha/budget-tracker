import Accounts from '@models/Accounts.model';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import { Op } from 'sequelize';

import {
  type AccountSyncStatus,
  SyncStatus,
  getLastAutoSync,
  getMultipleAccountsSyncStatus,
} from './sync-status-tracker';

export interface AccountWithConnection extends Accounts {
  bankDataProviderConnection: BankDataProviderConnections;
}

/**
 * Get all bank-connected accounts for a user
 */
export async function getUserBankAccounts(userId: number): Promise<AccountWithConnection[]> {
  return Accounts.findAll({
    where: {
      userId,
      bankDataProviderConnectionId: { [Op.ne]: null },
      isEnabled: true,
    },
    include: [
      {
        model: BankDataProviderConnections,
        as: 'bankDataProviderConnection',
        where: { isActive: true },
        required: true,
      },
    ],
  }) as Promise<AccountWithConnection[]>;
}

/**
 * Get sync status for all user's bank accounts
 */
export async function getUserAccountsSyncStatus(userId: number): Promise<{
  lastSyncAt: number | null;
  accounts: Array<AccountSyncStatus & { accountName: string; providerType: string }>;
  summary: {
    total: number;
    syncing: number;
    queued: number;
    completed: number;
    failed: number;
    idle: number;
  };
}> {
  const accounts = await getUserBankAccounts(userId);
  const accountIds = accounts.map((a) => a.id);

  const statuses = await getMultipleAccountsSyncStatus(accountIds);
  const lastSyncAt = await getLastAutoSync(userId);

  // Enrich statuses with account names and provider types
  const enrichedStatuses = statuses.map((status) => {
    const account = accounts.find((a) => a.id === status.accountId);
    return {
      ...status,
      accountName: account?.name || 'Unknown',
      providerType: account?.bankDataProviderConnection.providerType || 'Unknown',
    };
  });

  // Calculate summary
  const summary = {
    total: enrichedStatuses.length,
    syncing: enrichedStatuses.filter((s) => s.status === SyncStatus.SYNCING).length,
    queued: enrichedStatuses.filter((s) => s.status === SyncStatus.QUEUED).length,
    completed: enrichedStatuses.filter((s) => s.status === SyncStatus.COMPLETED).length,
    failed: enrichedStatuses.filter((s) => s.status === SyncStatus.FAILED).length,
    idle: enrichedStatuses.filter((s) => s.status === SyncStatus.IDLE).length,
  };

  return {
    lastSyncAt,
    accounts: enrichedStatuses,
    summary,
  };
}
