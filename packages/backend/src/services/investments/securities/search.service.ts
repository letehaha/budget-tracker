import { UserModel } from '@bt/shared/types';
import type { SecuritySearchResult } from '@bt/shared/types/investments';
import { logger } from '@js/utils';
import Holdings from '@models/investments/Holdings.model';
import Portfolios from '@models/investments/Portfolios.model';
import Securities from '@models/investments/Securities.model';

import { dataProviderFactory } from '../data-providers';

interface SearchOptions {
  query: string;
  limit?: number;
  portfolioId?: number;
  user: UserModel;
}

interface SecuritySearchResultFormatted extends SecuritySearchResult {
  isInPortfolio?: boolean; // Indicates if this security is already in the queried portfolio
}

// Represents the minimal holding data returned by the portfolio check query
interface HoldingSymbolLookup {
  securityId: number;
  security?: {
    symbol: string;
  };
}

export const searchSecurities = async ({
  query,
  limit = 20,
  user,
  portfolioId,
}: SearchOptions): Promise<SecuritySearchResultFormatted[]> => {
  logger.info(`Searching securities for: ${query}`);

  // Validate input
  if (!query) {
    logger.warn('Search query too short or empty');
    return [];
  }

  try {
    const provider = dataProviderFactory.getProvider();
    const searchResults = await provider.searchSecurities(query);

    // Apply limit if specified
    let limitedResults = limit ? searchResults.slice(0, limit) : searchResults;

    // If portfolioId is provided, check which securities are already in the portfolio
    if (portfolioId) {
      const holdings = (await Holdings.findAll({
        where: { portfolioId },
        attributes: ['securityId'], // Only fetch what we need from Holdings
        include: [
          {
            model: Securities,
            as: 'security',
            attributes: ['symbol'], // Only fetch the symbol from Securities
          },
          {
            model: Portfolios,
            as: 'portfolio',
            attributes: [], // Don't fetch any portfolio data, only use for filtering
            where: { userId: user.id },
            required: true,
          },
        ],
      })) as unknown as HoldingSymbolLookup[];

      // Create a Set of symbols that are in the portfolio for quick lookup
      const portfolioSymbols = new Set(holdings.map((h) => h.security?.symbol).filter(Boolean));

      // Add isInPortfolio flag to each search result
      limitedResults = limitedResults.map((result) => ({
        ...result,
        isInPortfolio: portfolioSymbols.has(result.symbol),
      }));
    }

    logger.info(`Found ${limitedResults.length} securities for query: ${query}`);
    return limitedResults;
  } catch (error) {
    logger.error({ message: 'Securities search failed', error: error as Error });

    // For search failures, return empty array rather than throwing
    // This allows the UI to show "no results found" instead of an error
    return [];
  }
};
