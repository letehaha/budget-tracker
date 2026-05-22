import { SECURITY_PROVIDER } from '@bt/shared/types';
import { logger } from '@js/utils';
import Holdings from '@models/investments/holdings.model';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import { withLock } from '@services/common/lock';
import { withTransaction } from '@services/common/with-transaction';
import { endOfDay, subDays } from 'date-fns';
import { Op } from 'sequelize';

import { dataProviderFactory } from '../data-providers';
import { partitionByMarketStatus } from '../data-providers/utils';

const SECURITIES_PRICES_SYNC_LOCK_KEY = 'lock:sync:securities-prices';

interface SecuritiesPricesSyncResult {
  totalProcessed: number;
  successfulUpdates: number;
  failedUpdates: number;
  skippedClosedMarket: number;
  errors: Array<{ securityId: string; symbol: string | null; error: string }>;
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

  // Step 1: Query ALL securities with holdings, prioritized by staleness.
  // `providerSymbol` is the canonical id since crypto display symbols are not unique;
  // a security may still have a NULL legacy `symbol`, but `providerSymbol` is NOT NULL.
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
      skippedClosedMarket: 0,
      errors: [],
    };
  }

  logger.info(`Found ${securitiesFromDb.length} securities to sync, prioritized by staleness`);

  const result: SecuritiesPricesSyncResult = {
    totalProcessed: securitiesFromDb.length,
    successfulUpdates: 0,
    failedUpdates: 0,
    skippedClosedMarket: 0,
    errors: [],
  };

  // Step 2: Use composite provider to fetch all prices efficiently
  const compositeProvider = dataProviderFactory.getProvider(SECURITY_PROVIDER.composite);

  // Key the lookup map on `providerSymbol`, not the display ticker. `PriceData.symbol`
  // carries the provider-native id (e.g. "bitcoin" from CoinGecko), so a map keyed on
  // the human-facing symbol would silently drop every crypto result.
  //
  // The DB unique constraint is `(providerName, providerSymbol)`, so two Security rows
  // CAN share a providerSymbol (e.g. "AAPL" stored once under yahoo and once under fmp).
  // A single-key map would silently overwrite one with the other. Detect that here and
  // log loudly — one of those rows will not get its price updated this run.
  const securitiesMapByProviderSymbol = new Map<string, Securities>();
  for (const security of securitiesFromDb) {
    const existing = securitiesMapByProviderSymbol.get(security.providerSymbol);
    if (existing) {
      logger.error(
        `Sync map collision: providerSymbol "${security.providerSymbol}" maps to multiple Securities ` +
          `(kept ${existing.id} [${existing.providerName}], dropping ${security.id} [${security.providerName}]). ` +
          `One row will not be updated until the map is keyed by (providerName, providerSymbol).`,
      );
      continue;
    }
    securitiesMapByProviderSymbol.set(security.providerSymbol, security);
  }
  const providerSymbols = [...securitiesMapByProviderSymbol.keys()];
  const securitiesInputs = [...securitiesMapByProviderSymbol.values()].map((s) => ({
    symbol: s.symbol ?? s.providerSymbol,
    providerSymbol: s.providerSymbol,
    assetClass: s.assetClass,
  }));

  logger.info(`Fetching prices for ${securitiesMapByProviderSymbol.size} securities using composite provider`);

  try {
    // Let composite provider handle all routing, grouping, and bulk fetching internally
    const fetchedPrices = await compositeProvider.fetchPricesForSecurities(securitiesInputs, yesterday);

    const securityPricesToUpsert: {
      securityId: string;
      date: Date;
      priceClose: string;
      source: SECURITY_PROVIDER | undefined;
    }[] = [];

    let securitiesIdsToPatch: string[] = [];

    // Step 3: Store fetched prices and update timestamps
    for (const priceData of fetchedPrices) {
      const securityData = securitiesMapByProviderSymbol.get(priceData.symbol);
      if (!securityData) {
        logger.warn(
          `No security found for providerSymbol "${priceData.symbol}" (from ${priceData.providerName}). ` +
            `Price will be dropped.`,
        );
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
      } catch (bulkError) {
        const bulkErrorMessage = bulkError instanceof Error ? bulkError.message : 'Unknown error';
        logger.info(
          `Bulk create failed (${bulkErrorMessage}), falling back to individual upserts for ${securityPricesToUpsert.length} records`,
        );

        for (const priceData of securityPricesToUpsert) {
          try {
            await SecurityPricing.upsert(priceData);
            result.successfulUpdates++;
          } catch (individualError) {
            failedPricesUpdates.push(priceData);
            result.failedUpdates++;

            const security = [...securitiesMapByProviderSymbol.values()].find((s) => s.id === priceData.securityId);

            const errorMessage = individualError instanceof Error ? individualError.message : 'Unknown error';

            result.errors.push({
              securityId: priceData.securityId,
              symbol: security?.symbol || null,
              error: errorMessage,
            });

            logger.error(
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

    // Step 4: Handle securities that didn't get price data from provider
    const fetchedProviderSymbols = new Set(fetchedPrices.map((p) => p.symbol));
    const missedInputs = securitiesInputs.filter((s) => !fetchedProviderSymbols.has(s.providerSymbol));

    if (missedInputs.length > 0) {
      const { expectedClosed, actuallyMissing } = partitionByMarketStatus({
        items: missedInputs,
        date: yesterday,
      });

      if (expectedClosed.length > 0) {
        result.skippedClosedMarket = expectedClosed.length;
        // Advance pricingLastSyncedAt for closed-market symbols so they don't dominate
        // the staleness queue on every weekend/holiday run.
        for (const { providerSymbol } of expectedClosed) {
          const id = securitiesMapByProviderSymbol.get(providerSymbol)?.id;
          if (id !== undefined) securitiesIdsToPatch.push(id);
        }
        logger.info(
          `${expectedClosed.length} symbols skipped (markets closed on ${yesterday.toISOString()}): ${expectedClosed.map((s) => s.symbol).join(', ')}`,
        );
      }

      if (actuallyMissing.length > 0) {
        logger.warn(
          `${actuallyMissing.length} symbols had no price data from provider: ${actuallyMissing.map((s) => s.symbol).join(', ')}`,
        );

        for (const { symbol, providerSymbol } of actuallyMissing) {
          result.failedUpdates++;
          result.errors.push({
            securityId: securitiesMapByProviderSymbol.get(providerSymbol)?.id || '',
            symbol,
            error: 'No price data returned from provider',
          });
        }
      }
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
  } catch (error) {
    // Handle total failure
    result.failedUpdates = providerSymbols.length;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error({
      message: 'Bulk price fetch failed for all securities',
      error: error as Error,
    });

    // Add error for all providerSymbols
    for (const providerSymbol of providerSymbols) {
      const security = securitiesMapByProviderSymbol.get(providerSymbol);
      result.errors.push({
        securityId: security?.id || '',
        symbol: security?.symbol ?? providerSymbol,
        error: errorMessage,
      });
    }
  }

  logger.info(
    `Securities prices daily sync completed. Processed: ${result.totalProcessed}, Success: ${result.successfulUpdates}, Failed: ${result.failedUpdates}, SkippedClosedMarket: ${result.skippedClosedMarket}`,
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
