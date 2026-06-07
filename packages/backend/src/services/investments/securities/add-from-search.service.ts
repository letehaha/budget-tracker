import { type SecuritySearchResult } from '@bt/shared/types/investments';
import { logger } from '@js/utils';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import { withTransaction } from '@services/common/with-transaction';

import { dataProviderFactory } from '../data-providers';
import { toProviderSymbol } from '../data-providers/base-provider';
import { ProviderHttpError } from '../data-providers/errors';
import { addOrUpdateFromProvider } from '../securities-manage';
import { findSecurityByIdentity } from './identity';

interface AddSecurityFromSearchParams {
  searchResult: SecuritySearchResult;
  /**
   * When user is uploading prices manually, we don't need to try fetch prices
   */
  skipPriceFetch?: boolean;
}

interface AddSecurityFromSearchResult {
  security: typeof Securities.prototype;
  latestPrice?: {
    price: number;
    date: Date;
  };
}

const addSecurityFromSearchImpl = async ({
  searchResult,
  skipPriceFetch = false,
}: AddSecurityFromSearchParams): Promise<AddSecurityFromSearchResult> => {
  logger.info(`Adding security from search: ${searchResult.symbol} - ${searchResult.name}`);

  // Step 1: Create or update the security using existing service
  await addOrUpdateFromProvider([searchResult]);

  // Step 2: Resolve the created/updated row via the shared identity helper –
  // the same key shape `addOrUpdateFromProvider` used for dedup. A non-crypto
  // search result whose existing row was sourced from a different provider
  // (e.g. an FMP-sourced VOO matched against a Yahoo hit) resolves to that
  // existing row instead of looking like a fresh insert.
  const security = await findSecurityByIdentity(searchResult);

  if (!security) {
    throw new Error(
      `Failed to create/find security with providerSymbol: ${searchResult.providerSymbol} (provider: ${searchResult.providerName})`,
    );
  }

  // Step 3: Fetch and store the latest price immediately (unless skipped)
  let latestPrice: AddSecurityFromSearchResult['latestPrice'];

  // Route the latest-price call through `priceSourceSymbol` when set so the
  // row's first stored price comes from a venue with dense data instead of
  // the sparse ISIN-suffix listing (Yahoo ISIN-fallback path). Declared outside
  // the try so the catch can reference it when annotating failure logs.
  const priceQuerySymbol = searchResult.priceSourceSymbol ?? searchResult.providerSymbol;

  if (!skipPriceFetch) {
    try {
      const provider = dataProviderFactory.getProvider(searchResult.providerName);
      // TODO: consider using composite provider here
      const priceData = await provider.getLatestPrice(toProviderSymbol(priceQuerySymbol));

      // Store the price in SecurityPricing table
      await SecurityPricing.create({
        securityId: security.id,
        date: priceData.date,
        priceClose: priceData.priceClose.toString(),
        source: provider.providerName,
      });

      latestPrice = {
        price: priceData.priceClose,
        date: priceData.date,
      };

      // Update the security's last price sync timestamp
      security.pricingLastSyncedAt = new Date();
      await security.save();

      logger.info(`Successfully fetched latest price for ${searchResult.symbol}: ${priceData.priceClose}`);
    } catch (error) {
      // The immediate price fetch is optional and best-effort: the security was
      // created successfully and the daily price-sync cron backfills its price on
      // the next run.
      //
      // 402 Payment Required is a known, expected failure mode for non-US-exchange
      // tickers on free-tier provider plans (e.g. FMP). It's not actionable – keep
      // it visible in Loki via info, but don't page Sentry on every occurrence.
      //
      // Leaf providers wrap their thrown errors via base-provider.formatProviderError,
      // which returns a plain Error with the original attached as `cause`. Unwrap one
      // level to recover the ProviderHttpError so the paywall check still matches.
      const httpError =
        error instanceof ProviderHttpError
          ? error
          : error instanceof Error && error.cause instanceof ProviderHttpError
            ? error.cause
            : null;
      const isExpectedPaywall = httpError?.status === 402;
      const severity = isExpectedPaywall ? 'info' : 'warn';
      const routedVia =
        priceQuerySymbol !== searchResult.providerSymbol ? ` (routed via priceSourceSymbol=${priceQuerySymbol})` : '';
      logger[severity](
        `Failed to fetch latest price for ${searchResult.symbol}${routedVia} (will be backfilled by daily sync)`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      // Don't throw - the security creation succeeded, price fetch is optional
    }
  }

  logger.info(`Successfully added security from search: ${searchResult.symbol}`);

  return {
    security,
    latestPrice,
  };
};

/**
 * Adds a security to the database from search results and optionally fetches its latest price.
 * This is used when a user selects a security from search results to add to their portfolio.
 *
 * @param params - The search result selected by the user
 * @param params.skipPriceFetch - If true, skips fetching the latest price from external API
 * @returns The created/updated security with optional latest price info
 */
export const addSecurityFromSearch = withTransaction(addSecurityFromSearchImpl);
