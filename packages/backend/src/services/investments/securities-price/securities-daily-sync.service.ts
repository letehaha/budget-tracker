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
import { toProviderSymbol } from '../data-providers/base-provider';
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

  // `securitiesById` is only used to recover symbol text for error logging in
  // the individual-upsert fallback path. The composite returns a Map keyed by
  // securityId, so primary-flow matching needs no lookup table.
  const securitiesById = new Map<string, Securities>(securitiesFromDb.map((s) => [s.id, s]));
  const securitiesInputs = securitiesFromDb.map((s) => ({
    securityId: s.id,
    symbol: s.symbol ?? s.providerSymbol,
    providerSymbol: toProviderSymbol(s.providerSymbol),
    assetClass: s.assetClass,
  }));

  logger.info(`Fetching prices for ${securitiesById.size} securities using composite provider`);

  try {
    // Composite returns a Map keyed by securityId; the type guarantees every
    // value carries the originating securityId, so no defensive guards are
    // needed when consuming it.
    const fetchedPrices = await compositeProvider.fetchPricesForSecurities(securitiesInputs, yesterday);

    const securityPricesToUpsert: {
      securityId: string;
      date: Date;
      priceClose: string;
      source: SECURITY_PROVIDER | undefined;
    }[] = [];

    let securitiesIdsToPatch: string[] = [];

    // Step 3: Store fetched prices and update timestamps
    for (const [securityId, priceData] of fetchedPrices) {
      if (!securitiesById.has(securityId)) {
        // Composite returned a securityId we didn't ask for. This should be
        // impossible — composite only fetches inputs we supplied — so it
        // signals a provider bug or data corruption.
        logger.error(
          `Composite returned unrequested securityId "${securityId}" ` +
            `(providerSymbol "${priceData.providerSymbol}" from ${priceData.providerName}). Dropping.`,
        );
        continue;
      }

      securityPricesToUpsert.push({
        securityId,
        date: priceData.date,
        priceClose: priceData.priceClose.toString(),
        source: priceData.providerName,
      });

      securitiesIdsToPatch.push(securityId);
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

            const security = securitiesById.get(priceData.securityId);

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
    const missedInputs = securitiesInputs.filter((s) => !fetchedPrices.has(s.securityId));

    if (missedInputs.length > 0) {
      const { expectedClosed, actuallyMissing } = partitionByMarketStatus({
        items: missedInputs,
        date: yesterday,
      });

      if (expectedClosed.length > 0) {
        result.skippedClosedMarket = expectedClosed.length;
        // Advance pricingLastSyncedAt for closed-market symbols so they don't dominate
        // the staleness queue on every weekend/holiday run.
        for (const { securityId } of expectedClosed) {
          securitiesIdsToPatch.push(securityId);
        }
        logger.info(
          `${expectedClosed.length} symbols skipped (markets closed on ${yesterday.toISOString()}): ${expectedClosed.map((s) => s.symbol).join(', ')}`,
        );
      }

      if (actuallyMissing.length > 0) {
        logger.warn(
          `${actuallyMissing.length} symbols had no price data from provider: ${actuallyMissing.map((s) => s.symbol).join(', ')}`,
        );

        // Advance `pricingLastSyncedAt` so a permanently-delisted or otherwise
        // unfetchable security doesn't dominate the staleness-prioritised queue
        // run after run. Without this, a single broken security at the head of
        // the queue would be retried on every sync while the rest of the table
        // also gets processed but stays "fresher" — slowly creating an
        // ever-growing backlog of work that always fails first.
        for (const { securityId, symbol } of actuallyMissing) {
          result.failedUpdates++;
          result.errors.push({
            securityId,
            symbol,
            error: 'No price data returned from provider',
          });
          securitiesIdsToPatch.push(securityId);
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
    result.failedUpdates = securitiesInputs.length;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error({
      message: 'Bulk price fetch failed for all securities',
      error: error as Error,
    });

    for (const input of securitiesInputs) {
      result.errors.push({
        securityId: input.securityId,
        symbol: input.symbol,
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
