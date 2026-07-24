import { isSelfHost } from '@config/is-self-host';
import { logger } from '@js/utils';
import { syncHistoricalPrices } from '@services/investments/securities-price/historical-sync.service';

/**
 * Backfill historical prices for restored securities on self-host only. Cloud
 * shares one global SecurityPricing table populated by other users plus the
 * daily price cron, so a restored security already has history; a self-host
 * instance has no other users, so it must fetch its own history or charts stay
 * empty. Fired post-commit and fire-and-forget: each `syncHistoricalPrices` call
 * opens its own transaction and holds a per-security lock, so it must run after
 * the restore transaction has committed and must never block or fail the restore.
 */
export function triggerPostRestorePriceSync({ securityIds }: { securityIds: string[] }): void {
  if (!isSelfHost()) return;

  for (const securityId of securityIds) {
    syncHistoricalPrices(securityId).catch((error) => {
      logger.warn(`Post-restore self-host historical price backfill failed for securityId: ${securityId}`, {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    });
  }
}
