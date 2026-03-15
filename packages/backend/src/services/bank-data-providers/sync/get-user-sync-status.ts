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

  const [statuses, lastSyncAt] = await Promise.all([
    getMultipleAccountsSyncStatus(accountIds),
    getLastAutoSync(userId),
  ]);

  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  const summary = { total: 0, syncing: 0, queued: 0, completed: 0, failed: 0, idle: 0 };

  const enrichedStatuses = statuses.map((status) => {
    const account = accountsById.get(status.accountId);

    summary.total++;
    switch (status.status) {
      case SyncStatus.SYNCING:
        summary.syncing++;
        break;
      case SyncStatus.QUEUED:
        summary.queued++;
        break;
      case SyncStatus.COMPLETED:
        summary.completed++;
        break;
      case SyncStatus.FAILED:
        summary.failed++;
        break;
      case SyncStatus.IDLE:
        summary.idle++;
        break;
    }

    return {
      ...status,
      accountName: account?.name || 'Unknown',
      providerType: account?.bankDataProviderConnection.providerType || 'Unknown',
    };
  });

  return {
    lastSyncAt,
    accounts: enrichedStatuses,
    summary,
  };
}
