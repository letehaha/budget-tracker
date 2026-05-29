import { ACCOUNT_STATUSES, type ConnectionNeedingReauth, DEACTIVATION_REASON } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import BankDataProviderConnections from '@models/bank-data-provider-connections.model';
import { Op, literal } from '@sequelize/core';

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
      status: ACCOUNT_STATUSES.active,
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
 * Get connections that were auto-deactivated due to an upstream auth failure
 * (expired session, revoked consent). These don't appear in regular sync status
 * because `getUserBankAccounts` filters by `isActive: true` — but the user needs
 * to see them to know they should reconnect.
 *
 * Filters by `metadata.deactivationReason === AUTH_FAILURE` so connections the
 * user disconnected manually stay hidden.
 *
 * Wrapped in try/catch so a JSONB query failure degrades to an empty list
 * instead of taking down the whole sync-status response — the regular sync
 * status is more important than the reauth banner.
 */
async function getConnectionsNeedingReauth(userId: number): Promise<ConnectionNeedingReauth[]> {
  try {
    const connections = await BankDataProviderConnections.findAll({
      where: {
        userId,
        isActive: false,
        // Raw JSONB path query — Sequelize's nested object form is unreliable
        // across dialect versions for JSONB, so use the Postgres ->> operator
        // directly to compare the text value of metadata.deactivationReason.
        [Op.and]: [literal(`metadata->>'deactivationReason' = '${DEACTIVATION_REASON.AUTH_FAILURE}'`)],
      },
      include: [
        {
          model: Accounts,
          as: 'accounts',
          where: { status: ACCOUNT_STATUSES.active },
          required: false,
        },
      ],
      order: [['updatedAt', 'DESC']],
    });

    return connections.map((conn) => {
      const metadata = (conn.metadata ?? {}) as Record<string, unknown>;
      return {
        connectionId: conn.id,
        providerType: conn.providerType,
        providerName: conn.providerName,
        bankName: typeof metadata.bankName === 'string' ? metadata.bankName : null,
        accountsCount: conn.accounts?.length ?? 0,
        deactivatedAt: conn.updatedAt?.toISOString() ?? null,
      };
    });
  } catch (error) {
    logger.error({ message: 'Failed to load connectionsNeedingReauth', error: error as Error }, { userId });
    return [];
  }
}

/**
 * Get sync status for all user's bank accounts
 */
export async function getUserAccountsSyncStatus(userId: number): Promise<{
  lastSyncAt: number | null;
  accounts: Array<AccountSyncStatus & { accountName: string; providerType: string }>;
  connectionsNeedingReauth: ConnectionNeedingReauth[];
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

  const [statuses, lastSyncAt, connectionsNeedingReauth] = await Promise.all([
    getMultipleAccountsSyncStatus(accountIds),
    getLastAutoSync(userId),
    getConnectionsNeedingReauth(userId),
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
    connectionsNeedingReauth,
    summary,
  };
}
