import type { SecuritySearchResult } from '@bt/shared/types/investments';
import { logger } from '@js/utils';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import { withTransaction } from '@services/common/with-transaction';

import { dataProviderFactory } from '../data-providers';
import { toProviderSymbol } from '../data-providers/base-provider';
import { ProviderHttpError } from '../data-providers/errors';
import { addOrUpdateFromProvider } from '../securities-manage';

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

  // Step 2: Get the created/updated security from database via the canonical
  // (providerName, providerSymbol) tuple – symbol alone is not unique across providers.
  const security = await Securities.findOne({
    where: {
      providerName: searchResult.providerName,
      providerSymbol: searchResult.providerSymbol,
    },
  });

  if (!security) {
    throw new Error(
      `Failed to create/find security with providerSymbol: ${searchResult.providerSymbol} (provider: ${searchResult.providerName})`,
    );
  }

  // Step 3: Fetch and store the latest price immediately (unless skipped)
  let latestPrice: AddSecurityFromSearchResult['latestPrice'];

  if (!skipPriceFetch) {
    try {
      const provider = dataProviderFactory.getProvider(searchResult.providerName);
      // TODO: conside using composite provider here
      const priceData = await provider.getLatestPrice(toProviderSymbol(searchResult.providerSymbol));

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
      const isExpectedPaywall = error instanceof ProviderHttpError && error.status === 402;
      const severity = isExpectedPaywall ? 'info' : 'warn';
      logger[severity](`Failed to fetch latest price for ${searchResult.symbol} (will be backfilled by daily sync)`, {
        error: error instanceof Error ? error.message : String(error),
      });
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
