import { logger } from '@js/utils/logger';
import Accounts from '@models/Accounts.model';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import Bottleneck from 'bottleneck';
import { Op } from 'sequelize';

import { syncTransactionsForAccount } from '../connection/sync-transactions-for-account';
import {
  type AccountSyncStatus,
  SyncStatus,
  getLastAutoSync,
  getMultipleAccountsSyncStatus,
  setAccountSyncStatus,
  shouldTriggerAutoSync,
  updateLastAutoSync,
} from './sync-status-tracker';

export interface SyncResult {
  totalAccounts: number;
  syncedAccounts: number;
  failedAccounts: number;
  skippedAccounts: number;
  accountResults: Array<{
    accountId: number;
    accountName: string;
    status: 'success' | 'failed' | 'skipped';
    error?: string;
  }>;
}

interface AccountWithConnection extends Accounts {
  bankDataProviderConnection: BankDataProviderConnections;
}

// Limit concurrent syncs to 5 to prevent event loop blocking
const syncLimiter = new Bottleneck({
  maxConcurrent: process.env.NODE_ENV === 'test' ? Infinity : 5,
});

/**
 * Get all bank-connected accounts for a user
 */
async function getUserBankAccounts(userId: number): Promise<AccountWithConnection[]> {
  return Accounts.findAll({
    where: {
      userId,
      bankDataProviderConnectionId: { [Op.ne]: null },
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
 * Sync a single account
 * Status tracking is handled by individual providers (Monobank, Enable Banking, etc.)
 */
async function syncSingleAccount(account: AccountWithConnection, userId: number): Promise<void> {
  await syncTransactionsForAccount({
    connectionId: account.bankDataProviderConnectionId as number,
    userId,
    accountId: account.id,
  });
  // Provider handles status updates (SYNCING -> COMPLETED/FAILED)
}

/**
 * Sync all bank-connected accounts for a user
 * Uses p-limit to prevent event loop blocking (max 5 concurrent syncs)
 * Monobank syncs are already queued by BullMQ, so they return immediately
 * Enable Banking syncs are long-running and benefit from the concurrency limit
 */
export async function syncAllUserAccounts(userId: number): Promise<SyncResult> {
  const accounts = await getUserBankAccounts(userId);

  if (accounts.length === 0) {
    return {
      totalAccounts: 0,
      syncedAccounts: 0,
      failedAccounts: 0,
      skippedAccounts: 0,
      accountResults: [],
    };
  }

  // Set all accounts to QUEUED immediately, before Bottleneck scheduling
  // This ensures frontend knows all accounts are pending, even those waiting
  // in Bottleneck's internal queue (which only executes 5 at a time)
  await Promise.all(accounts.map((account) => setAccountSyncStatus(account.id, SyncStatus.QUEUED)));

  // Trigger all syncs with concurrency control (fire and forget)
  // Providers will update status to SYNCING when they actually start
  accounts.forEach((account) => {
    syncLimiter
      .schedule(() => syncSingleAccount(account, userId))
      .catch((err: Error) => {
        logger.error({ message: 'Unhandled sync error', error: err }, { accountId: account.id });
      });
  });

  // Return immediately - frontend will poll /sync/status for updates
  return {
    totalAccounts: accounts.length,
    syncedAccounts: 0,
    failedAccounts: 0,
    skippedAccounts: 0,
    accountResults: accounts.map((acc) => ({
      accountId: acc.id,
      accountName: acc.name,
      status: 'skipped', // Status will be updated by providers
    })),
  };
}

/**
 * Check if auto-sync should be triggered and execute if needed
 * Returns sync result if sync was triggered, null if skipped
 */
export async function checkAndTriggerAutoSync(userId: number): Promise<SyncResult | null> {
  const shouldSync = await shouldTriggerAutoSync(userId);

  if (!shouldSync) {
    return null;
  }

  // Update last sync timestamp before starting
  await updateLastAutoSync(userId);

  // Trigger sync
  const result = await syncAllUserAccounts(userId);

  return result;
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
