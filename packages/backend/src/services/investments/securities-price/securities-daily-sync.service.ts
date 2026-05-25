import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types';
import { logger } from '@js/utils';
import Holdings from '@models/investments/holdings.model';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import { withLock } from '@services/common/lock';
import { subDays } from 'date-fns';
import { Op, WhereOptions } from 'sequelize';

import { dataProviderFactory } from '../data-providers';
import { BulkPriceData, toProviderSymbol } from '../data-providers/base-provider';
import { partitionByMarketStatus } from '../data-providers/utils';
import { startOfDayUtc } from './pricing-anchor';

interface SecuritiesPricesSyncResult {
  totalProcessed: number;
  successfulUpdates: number;
  failedUpdates: number;
  skippedClosedMarket: number;
  errors: Array<{ securityId: string; symbol: string | null; error: string }>;
}

type SyncLabel = 'stocks-daily' | 'crypto-hourly';

interface SyncOptions {
  /**
   * Sequelize WHERE clause restricting which securities are processed. Stocks
   * sync excludes crypto via `Op.notIn`; crypto sync whitelists crypto via
   * `Op.in`. Pass `undefined` to process every security with an active holding.
   */
  assetClassWhere: WhereOptions | undefined;
  /**
   * The timestamp passed to the composite provider as the "forDate" anchor.
   * Stocks: midnight UTC of yesterday. Crypto: now.
   */
  forDate: Date;
  /**
   * Computes the `date` column for each upserted row. Stocks anchor every row
   * to midnight UTC of yesterday (one row per day per security). Crypto uses
   * the provider's `priceAsOf` (= CoinGecko's `last_updated_at`) so multiple
   * intraday snapshots coexist as separate rows.
   */
  computeStoredDate: (price: BulkPriceData) => Date;
  /** Tagged log label used for traceability. */
  label: SyncLabel;
}

/**
 * Securities price sync that prioritizes securities with stale pricing data.
 *
 * Features:
 * 1. Queries securities connected to holdings, scoped by `assetClassWhere`.
 * 2. Prioritizes by pricingLastSyncedAt (oldest first).
 * 3. Uses composite data provider for automatic provider routing.
 * 4. Stores each row at the timestamp returned by `computeStoredDate`.
 * 5. Updates pricingLastSyncedAt after successful sync.
 *
 * No `withTransaction` wrapper: bulk and individual upserts are idempotent
 * (unique index on `securityId, date`), and wrapping the whole run in one
 * transaction would roll back successfully-upserted rows if the trailing
 * `pricingLastSyncedAt` patch failed — silently turning a partial-success run
 * into total data loss with a misleading success counter in the result.
 */
const securitiesPricesSyncImpl = async (options: SyncOptions): Promise<SecuritiesPricesSyncResult> => {
  const { assetClassWhere, forDate, computeStoredDate, label } = options;
  logger.info(`[${label}] Starting securities prices sync`);

  // Query securities with holdings, prioritized by staleness.
  // `providerSymbol` is the canonical id since crypto display symbols are not unique;
  // a security may still have a NULL legacy `symbol`, but `providerSymbol` is NOT NULL.
  const securitiesFromDb = await Securities.findAll({
    where: assetClassWhere,
    include: [
      {
        model: Holdings,
        required: true, // INNER JOIN - only securities with holdings
        attributes: [],
        where: {
          excluded: false, // Only exclude securities marked as excluded
        },
        // Chain through Portfolios so paranoid filtering drops holdings whose
        // parent portfolio is soft-deleted (trash) — otherwise we'd waste sync
        // budget on prices nobody needs.
        include: [
          {
            model: Portfolios,
            required: true,
            attributes: [],
          },
        ],
      },
    ],
    group: ['Securities.id'], // Deduplicate securities held by multiple users
    order: [['pricingLastSyncedAt', 'ASC NULLS FIRST']], // Prioritize oldest/never-synced first
    raw: false, // Need model instances to update pricingLastSyncedAt
  });

  if (securitiesFromDb.length === 0) {
    logger.info(`[${label}] No securities with holdings found for sync`);
    return {
      totalProcessed: 0,
      successfulUpdates: 0,
      failedUpdates: 0,
      skippedClosedMarket: 0,
      errors: [],
    };
  }

  logger.info(`[${label}] Found ${securitiesFromDb.length} securities to sync, prioritized by staleness`);

  const result: SecuritiesPricesSyncResult = {
    totalProcessed: securitiesFromDb.length,
    successfulUpdates: 0,
    failedUpdates: 0,
    skippedClosedMarket: 0,
    errors: [],
  };

  // Use composite provider to fetch all prices efficiently
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

  logger.info(`[${label}] Fetching prices for ${securitiesById.size} securities using composite provider`);

  // Only the provider fetch is wrapped — a total fetch failure is the one
  // scenario that should mark every requested security as failed. Failures
  // from per-row work (upserts, the `pricingLastSyncedAt` patch) are handled
  // in their own narrow try/catch blocks below so their errors surface with
  // accurate context instead of being mis-reported as a fetch failure.
  let fetchedPrices: Map<string, BulkPriceData>;
  try {
    // Composite returns a Map keyed by securityId; the type guarantees every
    // value carries the originating securityId, so no defensive guards are
    // needed when consuming it.
    fetchedPrices = await compositeProvider.fetchPricesForSecurities(securitiesInputs, forDate);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({
      message: `[${label}] Bulk price fetch failed for all securities`,
      error: error as Error,
    });
    result.failedUpdates = securitiesInputs.length;
    for (const input of securitiesInputs) {
      result.errors.push({
        securityId: input.securityId,
        symbol: input.symbol,
        error: errorMessage,
      });
    }
    return result;
  }

  const securityPricesToUpsert: {
    securityId: string;
    date: Date;
    priceClose: string;
    source: SECURITY_PROVIDER | undefined;
  }[] = [];

  let securitiesIdsToPatch: string[] = [];

  // Store fetched prices and update timestamps
  for (const [securityId, priceData] of fetchedPrices) {
    if (!securitiesById.has(securityId)) {
      // Composite returned a securityId we didn't ask for. This should be
      // impossible — composite only fetches inputs we supplied — so it
      // signals a provider bug or data corruption.
      logger.error(
        `[${label}] Composite returned unrequested securityId "${securityId}" ` +
          `(providerSymbol "${priceData.providerSymbol}" from ${priceData.providerName}). Dropping.`,
      );
      continue;
    }

    securityPricesToUpsert.push({
      securityId,
      date: computeStoredDate(priceData),
      priceClose: priceData.priceClose.toString(),
      source: priceData.providerName,
    });

    securitiesIdsToPatch.push(securityId);
  }

  const failedPricesUpdates: typeof securityPricesToUpsert = [];

  if (securityPricesToUpsert.length === 0) {
    logger.info(`[${label}] No security prices to store`);
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
      logger.info(`[${label}] Bulk created/updated ${securityPricesToUpsert.length} security prices`);
    } catch (bulkError) {
      // A bulk failure indicates a schema/constraint mismatch or a transient
      // DB issue — both deserve more visibility than a buried info line. Log
      // at error so Sentry captures the stack via logger.error's Error-aware
      // path (the warn variant only supports plain-string messages).
      logger.error({
        message: `[${label}] Bulk create failed; falling back to individual upserts for ${securityPricesToUpsert.length} records`,
        error: bulkError as Error,
      });

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
            `[${label}] Failed to upsert price for security ${security?.symbol || priceData.securityId}: ${errorMessage}`,
          );
        }
      }
    }
  }

  if (failedPricesUpdates.length) {
    // If some securities prices failed to update, filter them out and don't update `pricingLastSyncedAt`
    securitiesIdsToPatch = securitiesIdsToPatch.filter((i) => !failedPricesUpdates.some((e) => e.securityId === i));
  }

  // Handle securities that didn't get price data from provider
  const missedInputs = securitiesInputs.filter((s) => !fetchedPrices.has(s.securityId));

  if (missedInputs.length > 0) {
    const { expectedClosed, actuallyMissing } = partitionByMarketStatus({
      items: missedInputs,
      date: forDate,
    });

    if (expectedClosed.length > 0) {
      result.skippedClosedMarket = expectedClosed.length;
      // Advance pricingLastSyncedAt for closed-market symbols so they don't dominate
      // the staleness queue on every weekend/holiday run.
      for (const { securityId } of expectedClosed) {
        securitiesIdsToPatch.push(securityId);
      }
      logger.info(
        `[${label}] ${expectedClosed.length} symbols skipped (markets closed on ${forDate.toISOString()}): ${expectedClosed.map((s) => s.symbol).join(', ')}`,
      );
    }

    if (actuallyMissing.length > 0) {
      logger.warn(
        `[${label}] ${actuallyMissing.length} symbols had no price data from provider: ${actuallyMissing.map((s) => s.symbol).join(', ')}`,
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
    try {
      await Securities.update(
        { pricingLastSyncedAt: new Date() },
        {
          where: {
            id: { [Op.in]: securitiesIdsToPatch },
          },
        },
      );
      logger.info(`[${label}] Updated pricingLastSyncedAt for ${securitiesIdsToPatch.length} securities`);
    } catch (patchError) {
      // Price rows are persisted (independently correct), but the staleness
      // queue did not advance — those securities will be reprocessed next run.
      // Re-throw so the cron wrapper / manual-trigger controller reports
      // `ok: false` instead of silently returning a misleadingly-successful
      // result (prices saved, queue stuck).
      logger.error({
        message: `[${label}] Failed to advance pricingLastSyncedAt for ${securitiesIdsToPatch.length} securities`,
        error: patchError instanceof Error ? patchError : new Error(String(patchError)),
      });
      throw patchError instanceof Error ? patchError : new Error(String(patchError));
    }
  }

  logger.info(
    `[${label}] Securities prices sync completed. Processed: ${result.totalProcessed}, Success: ${result.successfulUpdates}, Failed: ${result.failedUpdates}, SkippedClosedMarket: ${result.skippedClosedMarket}`,
  );

  return result;
};

/**
 * Daily sync for non-crypto securities (stocks, ETFs, etc.).
 *
 * Anchors every row to midnight UTC of yesterday — one row per security per day,
 * matching the original DATEONLY-era semantics. Held under a stocks-specific
 * lock so it doesn't serialize against the hourly crypto sync.
 */
export const securitiesPricesStocksDailySync = withLock('lock:sync:securities-prices:stocks', () => {
  const yesterdayMidnightUtc = startOfDayUtc(subDays(new Date(), 1));
  return securitiesPricesSyncImpl({
    assetClassWhere: { assetClass: { [Op.notIn]: [ASSET_CLASS.crypto] } },
    forDate: yesterdayMidnightUtc,
    computeStoredDate: () => yesterdayMidnightUtc,
    label: 'stocks-daily',
  });
});

/**
 * Hourly intraday sync for crypto holdings.
 *
 * Anchors each row to CoinGecko's `last_updated_at` (= `priceAsOf` on the
 * provider response). This lets multiple intraday snapshots coexist as
 * separate rows, while the unique `(securityId, date)` index naturally dedupes
 * when two cron runs see the same upstream timestamp (e.g. when CoinGecko
 * hasn't refreshed a low-volume coin between runs).
 *
 * Held under a crypto-specific lock so concurrent stock + crypto syncs don't
 * block each other.
 */
export const securitiesPricesCryptoSync = withLock('lock:sync:securities-prices:crypto', () =>
  securitiesPricesSyncImpl({
    assetClassWhere: { assetClass: { [Op.in]: [ASSET_CLASS.crypto] } },
    forDate: new Date(),
    computeStoredDate: (price) => price.priceAsOf,
    label: 'crypto-hourly',
  }),
);
