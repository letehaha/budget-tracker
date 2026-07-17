import { Money } from '@common/types/money';
import { logger } from '@js/utils/logger';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';

/**
 * Spot-measure an account balance in the owner's base currency: the native
 * `amount` converted at the latest rate (`calculateRefAmount` dated today, cache
 * bypassed).
 *
 * `calculateRefAmount` throws when no exchange rate reaches the pair — an exotic
 * currency, a provider data gap, or a currency the owner isn't connected to. The
 * account-balance write paths that call this (the per-transaction balance hook on
 * create/update/delete, the import/bank-sync absorb, the loan recompute) must
 * never abort their NATIVE write over a missing rate; a transaction delete in
 * particular has to always succeed. On failure this returns `null` and logs once
 * under the single greppable code `ACCOUNT_REF_REMEASURE_FAILED` — the same code
 * the daily rate-sync remeasure uses, which re-anchors the kept-stale ref balance
 * as soon as a rate exists.
 *
 * `null` (rather than a fixed fallback) lets each caller decide how to keep the
 * ref side: reuse the account's stored `refCurrentBalance`, or omit the ref
 * column from its update entirely.
 */
export async function measureSpotRefBalance({
  userId,
  amount,
  baseCode,
  site,
}: {
  userId: number;
  amount: Money;
  baseCode: string;
  /** Names the calling write path in the failure log. */
  site: string;
}): Promise<Money | null> {
  try {
    return await calculateRefAmount({
      userId,
      amount,
      baseCode,
      date: new Date(),
      bypassCache: true,
    });
  } catch (error) {
    logger.error(
      {
        message: `Failed to measure spot ref balance (${site}); previous value kept; self-heals on next rate sync`,
        error: error as Error,
      },
      { code: 'ACCOUNT_REF_REMEASURE_FAILED', userId, baseCode },
    );
    return null;
  }
}
