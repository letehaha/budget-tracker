import { logger } from '@js/utils';
import Securities from '@models/investments/Securities.model';
import SecurityPricing from '@models/investments/SecurityPricing.model';
import { withTransaction } from '@services/common';
import { subDays } from 'date-fns';
import { Op } from 'sequelize';

import { dataProviderFactory } from '../data-providers';

interface SyncResult {
  fetchedCount: number;
  createdCount: number;
  updatedCount: number;
  ignoredCount: number;
}

/**
 * Fetches daily prices for a given date from the data provider and saves them to the database.
 *
 * @param forDate - The specific date to sync prices for. Defaults to yesterday.
 * @returns A summary of the sync operation.
 */
const syncDailyPricesImpl = async (forDate: Date = subDays(new Date(), 1)): Promise<SyncResult> => {
  logger.info(`Starting daily price sync for date: ${forDate.toISOString()}`);

  const provider = dataProviderFactory.getProvider();

  const pricesFromProvider = await provider.getDailyPrices(forDate);

  if (pricesFromProvider.length === 0) {
    logger.warn('Provider returned no prices. Aborting sync.');
    return {
      fetchedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      ignoredCount: 0,
    };
  }

  // Get all symbols from the fetched data to look up their IDs efficiently
  const symbols = [...new Set(pricesFromProvider.map((p) => p.symbol))];
  const securitiesInDb = await Securities.findAll({
    where: { symbol: { [Op.in]: symbols } },
    attributes: ['id', 'symbol'],
    raw: true,
  });

  // Create a map for quick symbol-to-ID lookup
  const symbolToIdMap = new Map(securitiesInDb.map((s) => [s.symbol, s.id]));

  // Prepare data for bulk insertion, filtering out prices for symbols not in our DB
  let ignoredCount = 0;
  const pricesToCreate = pricesFromProvider
    .map((price) => {
      const securityId = symbolToIdMap.get(price.symbol);
      if (!securityId) {
        ignoredCount++;
        return null;
      }
      return {
        securityId,
        date: price.date,
        priceClose: price.priceClose.toString(), // Ensure it's a string for DECIMAL type
        source: provider.providerName,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (pricesToCreate.length === 0) {
    logger.warn('No valid prices to sync after filtering. Aborting.');
    return {
      fetchedCount: pricesFromProvider.length,
      createdCount: 0,
      updatedCount: 0,
      ignoredCount,
    };
  }

  // Use bulkCreate with updateOnDuplicate to efficiently insert/update records
  const result = await SecurityPricing.bulkCreate(pricesToCreate, {
    updateOnDuplicate: ['priceClose', 'updatedAt'], // Fields to update if a record for that securityId/date exists
  });

  logger.info(`Price sync complete. Created/Updated: ${result.length}`);

  return {
    fetchedCount: pricesFromProvider.length,
    // Note: bulkCreate with updateOnDuplicate doesn't easily distinguish between created/updated.
    // This count represents the total number of records successfully processed.
    createdCount: result.length,
    updatedCount: 0, // This is a simplification for now.
    ignoredCount,
  };
};

export const syncDailyPrices = withTransaction(syncDailyPricesImpl);
