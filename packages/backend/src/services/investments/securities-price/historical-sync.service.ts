import { logger } from '@js/utils';
import Securities from '@models/investments/Securities.model';
import SecurityPricing from '@models/investments/SecurityPricing.model';
import { withTransaction } from '@services/common';
import { withLock } from '@services/common/lock';
import { dataProviderFactory } from '@services/investments/data-providers';
import { subYears } from 'date-fns';

const syncHistoricalPricesImpl = async (securityId: number): Promise<{ count: number }> => {
  logger.info(`Starting historical price sync for securityId: ${securityId}`);

  const security = await Securities.findByPk(securityId);
  if (!security || !security.symbol) {
    logger.error(`Security with ID ${securityId} not found or has no symbol.`);
    return { count: 0 };
  }

  const provider = dataProviderFactory.getProvider(security.providerName);
  const endDate = new Date();
  const startDate = subYears(endDate, 5); // Fetch up to 5 years of data

  const prices = await provider.getHistoricalPrices(security.symbol, startDate, endDate);

  if (prices.length === 0) {
    logger.warn(`No historical prices found for symbol ${security.symbol}.`);
    return { count: 0 };
  }

  const pricesToCreate = prices.map((price) => ({
    securityId: security.id,
    date: price.date,
    priceClose: price.priceClose.toString(),
    source: provider.providerName,
  }));

  await SecurityPricing.bulkCreate(pricesToCreate, {
    ignoreDuplicates: true, // Don't error if a price for a specific date already exists
  });

  // Update the main security record
  security.pricingLastSyncedAt = new Date();
  await security.save();

  logger.info(`Successfully synced ${prices.length} historical price points for ${security.symbol}.`);
  return { count: prices.length };
};

// Wrap with a lock to prevent multiple syncs for the same security at the same time
const lockedSync = (securityId: number) =>
  withLock(`price-sync:security:${securityId}`, () => syncHistoricalPricesImpl(securityId))();

export const syncHistoricalPrices = withTransaction(lockedSync);
