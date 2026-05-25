import { securitiesPricesCryptoSync } from '@root/services/investments/securities-price/securities-daily-sync.service';

import { createScheduledSync } from './lib/create-scheduled-sync';

/**
 * Crypto intraday price sync — runs every hour on the hour (UTC).
 *
 * Crypto markets are 24/7 and CoinGecko's `last_updated_at` typically ticks
 * every few minutes for active coins, so hourly cadence captures meaningful
 * intraday movement without burning quota (~720 calls/month at one batch per
 * run, well under the Demo plan's 10k cap).
 */
export const cryptoPricesSyncCron = createScheduledSync({
  name: 'crypto prices',
  cronExpression: '0 * * * *',
  timeZone: 'UTC',
  scheduleDescription: 'runs every hour (UTC)',
  run: securitiesPricesCryptoSync,
});
