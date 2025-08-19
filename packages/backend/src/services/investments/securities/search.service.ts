import type { SecuritySearchResult } from '@bt/shared/types/investments';
import { logger } from '@js/utils';
import { withTransaction } from '@services/common';

import { dataProviderFactory } from '../data-providers';

interface SearchOptions {
  query: string;
  limit?: number;
}

const searchSecuritiesImpl = async ({ query, limit = 20 }: SearchOptions): Promise<SecuritySearchResult[]> => {
  logger.info(`Searching securities for: ${query}`);

  // Validate input
  if (!query || query.length < 2) {
    logger.warn('Search query too short or empty');
    return [];
  }

  try {
    // Get Alpha Vantage provider (our default provider)
    const provider = dataProviderFactory.getProvider();

    // Call the provider search directly
    const searchResults = await provider.searchSecurities(query);

    // Apply limit if specified
    const limitedResults = limit ? searchResults.slice(0, limit) : searchResults;

    logger.info(`Found ${limitedResults.length} securities for query: ${query}`);
    return limitedResults;
  } catch (error) {
    logger.error({ message: 'Securities search failed', error: error as Error });

    // For search failures, return empty array rather than throwing
    // This allows the UI to show "no results found" instead of an error
    return [];
  }
};

export const searchSecurities = withTransaction(searchSecuritiesImpl);
