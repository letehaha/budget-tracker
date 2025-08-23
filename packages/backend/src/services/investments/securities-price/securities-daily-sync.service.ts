import { SECURITY_PROVIDER } from '@bt/shared/types';
import { logger } from '@js/utils';
import Holdings from '@models/investments/Holdings.model';
import Securities from '@models/investments/Securities.model';
import SecurityPricing from '@models/investments/SecurityPricing.model';
import { withTransaction } from '@services/common';
import { withLock } from '@services/common/lock';
import { endOfDay, subDays } from 'date-fns';
import { Op } from 'sequelize';

import { dataProviderFactory } from '../data-providers';

const SECURITIES_PRICES_SYNC_LOCK_KEY = 'lock:sync:securities-prices';

interface SecuritiesPricesSyncResult {
  totalProcessed: number;
  successfulUpdates: number;
  failedUpdates: number;
  errors: Array<{ securityId: number; symbol: string | null; error: string }>;
}

/**
 * Securities daily price sync that prioritizes securities with stale pricing data.
 *
 * Features:
 * 1. Queries ALL securities connected to holdings (including 0 quantity)
 * 2. Prioritizes by pricingLastSyncedAt (oldest first)
 * 3. Uses composite data provider for automatic provider routing
 * 4. Updates pricingLastSyncedAt after successful sync
 */
const securitiesPricesSyncImpl = async (): Promise<SecuritiesPricesSyncResult> => {
  const yesterday = endOfDay(subDays(new Date(), 1));
  logger.info('Starting securities prices daily price sync');

  // Step 1: Query ALL securities with holdings, prioritized by staleness
  const securitiesFromDb = await Securities.findAll({
    include: [
      {
        model: Holdings,
        required: true, // INNER JOIN - only securities with holdings
        attributes: [],
        where: {
          excluded: false, // Only exclude securities marked as excluded
        },
      },
    ],
    where: {
      symbol: { [Op.ne]: null }, // Only securities with symbols
    },
    group: ['Securities.id'], // Deduplicate securities held by multiple users
    order: [['pricingLastSyncedAt', 'ASC NULLS FIRST']], // Prioritize oldest/never-synced first
    raw: false, // Need model instances to update pricingLastSyncedAt
  });

  if (securitiesFromDb.length === 0) {
    logger.info('No securities with holdings found for sync');
    return {
      totalProcessed: 0,
      successfulUpdates: 0,
      failedUpdates: 0,
      errors: [],
    };
  }

  logger.info(`Found ${securitiesFromDb.length} securities to sync, prioritized by staleness`);

  const result: SecuritiesPricesSyncResult = {
    totalProcessed: securitiesFromDb.length,
    successfulUpdates: 0,
    failedUpdates: 0,
    errors: [],
  };

  // Step 2: Use composite provider to fetch all prices efficiently
  const compositeProvider = dataProviderFactory.getProvider(SECURITY_PROVIDER.composite);

  const securitiesMapBySymbol = new Map(securitiesFromDb.filter((s) => s.symbol).map((s) => [s.symbol!, s]));
  const symbols = [...securitiesMapBySymbol.keys()];

  logger.info(`Fetching prices for ${securitiesMapBySymbol.size} symbols using composite provider`);

  try {
    // Let composite provider handle all routing, grouping, and bulk fetching internally
    const fetchedPrices = await compositeProvider.fetchPricesForSecurities(symbols, yesterday);

    const securityPricesToUpsert: {
      securityId: number;
      date: Date;
      priceClose: string;
      source: SECURITY_PROVIDER | undefined;
    }[] = [];

    let securitiesIdsToPatch: number[] = [];

    // Step 3: Store fetched prices and update timestamps
    for (const priceData of fetchedPrices) {
      const securityData = securitiesMapBySymbol.get(priceData.symbol);
      if (!securityData) {
        logger.warn(`No security ID found for symbol: ${priceData.symbol}`);
        continue;
      }

      // Store the price
      securityPricesToUpsert.push({
        securityId: securityData.id,
        date: priceData.date,
        priceClose: priceData.priceClose.toString(),
        source: priceData.providerName,
      });

      securitiesIdsToPatch.push(securityData.id);
    }

    const failedPricesUpdates: typeof securityPricesToUpsert = [];

    if (securityPricesToUpsert.length === 0) {
      logger.info('No security prices to store');
    } else {
      // TODO: for high amount of securities, consider wrapping everything in batches
      // and try do bulk/individual updates for chunks of 50-100 symbols. If there will
      // be 1000 of securities, but bulk will fail, we will need to process all 1000
      // individually – it's too costly.
      try {
        await SecurityPricing.bulkCreate(securityPricesToUpsert, {
          updateOnDuplicate: ['priceClose', 'source'],
          validate: true,
        });

        result.successfulUpdates = securityPricesToUpsert.length;
        logger.info(`Bulk created/updated ${securityPricesToUpsert.length} security prices`);
      } catch (err) {
        logger.warn(
          `Bulk create failed, falling back to individual upserts for ${securityPricesToUpsert.length} records`,
        );

        for (const priceData of securityPricesToUpsert) {
          try {
            await SecurityPricing.upsert(priceData);
            result.successfulUpdates++;
          } catch (individualError) {
            failedPricesUpdates.push(priceData);
            result.failedUpdates++;

            const security = [...securitiesMapBySymbol.values()].find((s) => s.id === priceData.securityId);

            const errorMessage = individualError instanceof Error ? individualError.message : 'Unknown error';

            result.errors.push({
              securityId: priceData.securityId,
              symbol: security?.symbol || null,
              error: errorMessage,
            });

            logger.warn(
              `Failed to upsert price for security ${security?.symbol || priceData.securityId}: ${errorMessage}`,
            );
          }
        }
      }
    }

    if (failedPricesUpdates.length) {
      // If some securities prices failed to update, filter them out and don't update `pricingLastSyncedAt`
      securitiesIdsToPatch = securitiesIdsToPatch.filter((i) => !failedPricesUpdates.some((e) => e.securityId === i));
    }

    if (securitiesIdsToPatch.length > 0) {
      await Securities.update(
        { pricingLastSyncedAt: new Date() },
        {
          where: {
            id: { [Op.in]: securitiesIdsToPatch },
          },
        },
      );

      logger.info(`Updated pricingLastSyncedAt for ${securitiesIdsToPatch.length} securities`);
    }

    // Step 4: Handle securities that didn't get price data from provider
    const fetchedSymbols = new Set(fetchedPrices.map((p) => p.symbol));
    const missedSymbols = symbols.filter((symbol) => !fetchedSymbols.has(symbol));

    if (missedSymbols.length > 0) {
      logger.warn(`${missedSymbols.length} symbols had no price data from provider: ${missedSymbols.join(', ')}`);

      for (const symbol of missedSymbols) {
        result.failedUpdates++;
        result.errors.push({
          securityId: securitiesMapBySymbol.get(symbol)?.id || 0,
          symbol,
          error: 'No price data returned from provider',
        });
      }
    }
  } catch (error) {
    // Handle total failure
    result.failedUpdates = symbols.length;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error({
      message: 'Bulk price fetch failed for all securities',
      error: error as Error,
    });

    // Add error for all symbols
    for (const symbol of symbols) {
      result.errors.push({
        securityId: securitiesMapBySymbol.get(symbol)?.id || 0,
        symbol,
        error: errorMessage,
      });
    }
  }

  logger.info(
    `Securities prices daily sync completed. Processed: ${result.totalProcessed}, Success: ${result.successfulUpdates}, Failed: ${result.failedUpdates}`,
  );

  return result;
};

/**
 * Securities daily price sync with locking to prevent concurrent execution.
 */
export const securitiesPricesDailySync = withLock(
  SECURITIES_PRICES_SYNC_LOCK_KEY,
  withTransaction(securitiesPricesSyncImpl),
);
