import type { SecuritySearchResult } from '@bt/shared/types/investments';
import { logger } from '@js/utils';
import Securities from '@models/investments/Securities.model';
import SecurityPricing from '@models/investments/SecurityPricing.model';
import { withTransaction } from '@services/common';

import { dataProviderFactory } from '../data-providers';
import { addOrUpdateFromProvider } from '../securities-manage';

interface AddSecurityFromSearchParams {
  searchResult: SecuritySearchResult;
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
}: AddSecurityFromSearchParams): Promise<AddSecurityFromSearchResult> => {
  logger.info(`Adding security from search: ${searchResult.symbol} - ${searchResult.name}`);

  // Step 1: Create or update the security using existing service
  await addOrUpdateFromProvider([searchResult]);

  // Step 2: Get the created/updated security from database
  const security = await Securities.findOne({
    where: { symbol: searchResult.symbol },
  });

  if (!security) {
    throw new Error(`Failed to create/find security with symbol: ${searchResult.symbol}`);
  }

  // Step 3: Fetch and store the latest price immediately
  let latestPrice: AddSecurityFromSearchResult['latestPrice'];

  try {
    const provider = dataProviderFactory.getProvider(searchResult.providerName);
    // TODO: conside using composite provider here
    const priceData = await provider.getLatestPrice(searchResult.symbol);

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
    logger.error({
      message: `Failed to fetch latest price for ${searchResult.symbol}`,
      error: error as Error,
    });
    // Don't throw - the security creation succeeded, price fetch is optional
  }

  logger.info(`Successfully added security from search: ${searchResult.symbol}`);

  return {
    security,
    latestPrice,
  };
};

/**
 * Adds a security to the database from search results and fetches its latest price.
 * This is used when a user selects a security from search results to add to their portfolio.
 *
 * @param params - The search result selected by the user
 * @returns The created/updated security with latest price info
 */
export const addSecurityFromSearch = withTransaction(addSecurityFromSearchImpl);
