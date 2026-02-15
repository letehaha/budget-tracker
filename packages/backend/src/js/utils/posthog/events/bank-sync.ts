import { trackEvent } from '../index';

export type BankProvider = 'monobank' | 'enable_banking' | 'lunchflow';

/**
 * Track bank connection completion.
 */
export function trackBankConnected({
  userId,
  provider,
  accountsCount,
  sessionId,
}: {
  userId: string | number;
  provider: BankProvider;
  accountsCount: number;
  sessionId?: string | null;
}): void {
  trackEvent({
    userId,
    event: 'bank_connected',
    properties: {
      provider,
      accounts_count: accountsCount,
    },
    sessionId,
  });
}

/**
 * Track bank sync completion.
 */
export function trackBankSyncCompleted({
  userId,
  provider,
  transactionsCount,
  accountsCount,
  sessionId,
}: {
  userId: string | number;
  provider: BankProvider;
  transactionsCount: number;
  accountsCount: number;
  sessionId?: string | null;
}): void {
  trackEvent({
    userId,
    event: 'bank_sync_completed',
    properties: {
      provider,
      transactions_count: transactionsCount,
      accounts_count: accountsCount,
    },
    sessionId,
  });
}
