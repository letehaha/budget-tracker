import { createController } from '@controllers/helpers/controller-factory';
import { cryptoPricesSyncCron } from '@crons/crypto-prices-sync';
import { securitiesDailySyncCron } from '@crons/securities-daily-sync';
import z from 'zod';

const summarize = (result: PromiseSettledResult<unknown>): { ok: boolean; error?: string } => {
  if (result.status === 'fulfilled') return { ok: true };
  const reason = result.reason;
  return { ok: false, error: reason instanceof Error ? reason.message : String(reason) };
};

export default createController(z.object({}), async () => {
  // Run both syncs in parallel under separate locks so a lock contention or
  // provider failure on one side never silently skips the other. The operator
  // hitting the button wants a full refresh — partial outcomes must be visible
  // per-side rather than hidden behind a single throw.
  const [stocks, crypto] = await Promise.allSettled([
    securitiesDailySyncCron.triggerManualSync(),
    cryptoPricesSyncCron.triggerManualSync(),
  ]);

  return {
    data: {
      message: 'Securities sync triggered (stocks + crypto)',
      timestamp: new Date().toISOString(),
      stocks: summarize(stocks),
      crypto: summarize(crypto),
    },
  };
});
