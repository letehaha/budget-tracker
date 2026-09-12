import type { RecordId } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import { isBaseCurrencyChangeLocked } from '@services/currencies/base-currency-lock';

import { enqueueAccountSync } from './account-sync-queue';
import { type AccountWithConnection, getUserBankAccounts } from './get-user-sync-status';
import { shouldTriggerAutoSync, updateLastAutoSync } from './sync-status-tracker';

// Re-export for backwards compatibility
export { getUserAccountsSyncStatus } from './get-user-sync-status';

interface SyncResult {
  totalAccounts: number;
  queuedAccounts: number;
}

/**
 * Queue a transaction sync for every bank-connected account of a user.
 * Returns as soon as the jobs are queued — the frontend polls /sync/status,
 * which the providers update as each account moves SYNCING → COMPLETED/FAILED.
 */
export async function syncAllUserAccounts(userId: number): Promise<SyncResult> {
  const accounts = await getUserBankAccounts(userId);

  if (accounts.length === 0) {
    return { totalAccounts: 0, queuedAccounts: 0 };
  }

  // Group by connection so batch-capable providers (e.g. SimpleFIN) sync the
  // whole connection in one windowed pass instead of a per-account fan-out —
  // important for providers with a tight daily request budget.
  const accountsByConnection = new Map<RecordId, AccountWithConnection[]>();
  for (const account of accounts) {
    const connectionId = account.bankDataProviderConnectionId;
    const group = accountsByConnection.get(connectionId);
    if (group) group.push(account);
    else accountsByConnection.set(connectionId, [account]);
  }

  const connections = [...accountsByConnection];
  const outcomes = await Promise.allSettled(
    connections.map(([connectionId, connectionAccounts]) =>
      enqueueAccountSync({
        userId,
        connectionId,
        providerType: connectionAccounts[0]!.bankDataProviderConnection.providerType,
        accountIds: connectionAccounts.map((account) => account.id),
      }),
    ),
  );

  let queuedAccounts = 0;
  let firstError: unknown;
  outcomes.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') {
      queuedAccounts += connections[index]![1].length;
      return;
    }
    logger.error({
      message: `[Sync Manager] Failed to queue sync for connection ${connections[index]![0]}`,
      error: outcome.reason as Error,
    });
    firstError ??= outcome.reason;
  });

  if (firstError) throw firstError;

  return { totalAccounts: accounts.length, queuedAccounts };
}

/**
 * Check if auto-sync should be triggered and execute if needed
 * Returns sync result if sync was triggered, null if skipped
 */
export async function checkAndTriggerAutoSync(userId: number): Promise<SyncResult | null> {
  // A base-currency recalculation is rewriting this user's ref* amounts; kicking
  // a fresh sync now would race the migration and commit old-base rows. Skip —
  // the next /sync/check tick after the lock clears triggers it.
  if (await isBaseCurrencyChangeLocked({ userId })) {
    return null;
  }

  const shouldSync = await shouldTriggerAutoSync(userId);

  if (!shouldSync) {
    return null;
  }

  const result = await syncAllUserAccounts(userId);

  // Only after a successful enqueue, so a failed attempt is retried by the next tick.
  await updateLastAutoSync(userId);

  return result;
}
