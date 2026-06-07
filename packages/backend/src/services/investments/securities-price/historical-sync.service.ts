import { ASSET_CLASS } from '@bt/shared/types/investments';
import { NotFoundError } from '@js/errors';
import { logger } from '@js/utils';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import { withLock } from '@services/common/lock';
import { withTransaction } from '@services/common/with-transaction';
import { dataProviderFactory } from '@services/investments/data-providers';
import { PriceData, toProviderSymbol } from '@services/investments/data-providers/base-provider';
import { subYears } from 'date-fns';

import { bucketByUtcDay } from './pricing-anchor';

// CoinGecko Demo tier only serves up to 1 year of history. Stocks (Yahoo etc.)
// happily go back further, so keep the longer backfill for them. Extending the
// crypto window beyond 1y requires a second data source or a paid plan.
const STOCK_BACKFILL_YEARS = 5;
const CRYPTO_BACKFILL_YEARS = 1;

const syncHistoricalPricesImpl = async (securityId: string): Promise<{ count: number }> => {
  logger.info(`Starting historical price sync for securityId: ${securityId}`);

  const security = await Securities.findByPk(securityId);
  if (!security) {
    throw new NotFoundError({ message: `Security with ID ${securityId} not found` });
  }

  const endDate = new Date();
  const yearsBack = security.assetClass === ASSET_CLASS.crypto ? CRYPTO_BACKFILL_YEARS : STOCK_BACKFILL_YEARS;
  const startDate = subYears(endDate, yearsBack);

  // Use composite provider which automatically handles US vs non-US routing and fallbacks
  const compositeProvider = dataProviderFactory.getProvider();

  // `priceQuerySymbol` returns the same value as `providerSymbol` for ordinary
  // securities; for rows with `priceSourceSymbol` set it returns the local-ticker
  // venue the Yahoo ISIN-fallback path chose for dense historical data.
  const querySymbol = security.priceQuerySymbol;
  const routedVia = querySymbol !== security.providerSymbol ? ` (routed via priceSourceSymbol=${querySymbol})` : '';

  logger.info(
    `Fetching historical prices for ${security.symbol ?? security.providerSymbol} (${security.assetClass}, ${yearsBack}yr)${routedVia} using composite provider`,
  );

  const prices: PriceData[] = await compositeProvider.getHistoricalPrices(toProviderSymbol(querySymbol), {
    startDate,
    endDate,
    assetClass: security.assetClass,
  });

  if (prices.length === 0) {
    // When the row has an explicit `priceSourceSymbol` and the provider still
    // returns nothing, that source is broken (delisted, renamed, throttled) –
    // not the silent "no data on this ticker" case for ordinary rows. Warn so
    // it shows up in alerts instead of getting buried in info-level noise.
    const severity = querySymbol !== security.providerSymbol ? 'warn' : 'info';
    logger[severity](`No historical prices found for ${security.symbol ?? security.providerSymbol}${routedVia}.`);
    return { count: 0 };
  }

  const dailyPrices = bucketByUtcDay(prices);

  const pricesToCreate = dailyPrices.map((price) => ({
    securityId: security.id,
    date: price.date,
    priceClose: price.priceClose.toString(),
    source: price.providerName,
  }));

  await SecurityPricing.bulkCreate(pricesToCreate, {
    ignoreDuplicates: true, // Don't error if a price for a specific date already exists
  });

  // Update the main security record
  security.pricingLastSyncedAt = new Date();
  await security.save();

  logger.info(
    `Submitted ${dailyPrices.length} historical price points (bucketed from ${prices.length} provider points; ` +
      `existing rows were skipped via ignoreDuplicates) for ${security.symbol ?? security.providerSymbol}.`,
  );
  return { count: dailyPrices.length };
};

// Wrap with a lock to prevent multiple syncs for the same security at the same time
const lockedSync = (securityId: string) =>
  withLock(`price-sync:security:${securityId}`, () => syncHistoricalPricesImpl(securityId))();

export const syncHistoricalPrices = withTransaction(lockedSync);
