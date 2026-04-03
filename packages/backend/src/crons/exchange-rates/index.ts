import { logger } from '@js/utils';
import { syncExchangeRates } from '@services/exchange-rates/sync-exchange-rates';
import { CronJob } from 'cron';

export const loadCurrencyRatesJob = new CronJob(
  // Every day at 18:00 UTC (after ECB publishes rates ~16:00 CET)
  '0 18 * * *',
  async function () {
    try {
      await syncExchangeRates();
    } catch (error) {
      logger.error({
        message: 'Load currency exchange rates cron job is failed.',
        error: error as Error,
      });
    }
  },
  null, // onComplete
  false,
  'UTC', // timeZone
);
