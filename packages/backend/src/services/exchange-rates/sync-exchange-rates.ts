import { logger } from '@js/utils';

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
}
