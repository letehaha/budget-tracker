import { logger } from '@js/utils';
import { syncExchangeRates } from '@services/exchange-rates/sync-exchange-rates';
import { CronJob } from 'cron';

export const loadCurrencyRatesJob = new CronJob(
  // Every day at 1am
  '0 1 * * *',
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
