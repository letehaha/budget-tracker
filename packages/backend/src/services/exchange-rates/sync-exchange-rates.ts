import { logger } from '@js/utils';
import { remeasureRefBalances } from '@services/accounts/remeasure-ref-balances';

import { ensureRatesForDate } from './ensure-rates-for-date';

export async function syncExchangeRates(): Promise<void> {
  try {
    // No `currencies` → full sync: fetch unless ApiLayer already covered today.
    await ensureRatesForDate(new Date());
    logger.info('Exchange rates synced successfully');
  } catch (error) {
    logger.error({ message: 'Error syncing exchange rates:', error: error as Error });
    throw error;
  }

  // Fresh rates change what every non-base-currency balance is worth in base
  // currency, so stored spot measures (refCurrentBalance/refCreditLimit) must be
  // re-anchored. Isolated from the sync result: the rates themselves landed, and
  // remeasure handles per-account failures internally.
  try {
    const { updated, failed } = await remeasureRefBalances({});
    logger.info(`Remeasured ref balances after rate sync: ${updated} updated, ${failed} failed`);
  } catch (error) {
    logger.error({ message: 'Failed to remeasure ref balances after rate sync', error: error as Error });
  }
}
