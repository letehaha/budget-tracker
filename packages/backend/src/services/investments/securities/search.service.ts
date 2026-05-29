import { UserModel } from '@bt/shared/types';
import {
  ASSET_CLASS,
  SECURITY_PROVIDER,
  SUPPORTED_ASSET_CLASSES,
  type SecuritySearchResult,
} from '@bt/shared/types/investments';
import { logger } from '@js/utils';
import Holdings from '@models/investments/holdings.model';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';

import { dataProviderFactory } from '../data-providers';

interface SearchOptions {
  query: string;
  limit?: number;
  portfolioId?: string;
  /**
   * Narrow results to a single asset class (driven by the UI All / Stocks /
   * Crypto pill-tab). When omitted, all supported classes are returned.
   */
  assetClass?: ASSET_CLASS;
  user: UserModel;
}

interface SecuritySearchResultFormatted extends SecuritySearchResult {
  isInPortfolio?: boolean; // Indicates if this security is already in the queried portfolio
}

// Represents the minimal holding data returned by the portfolio check query
interface HoldingProviderLookup {
  securityId: string;
  security?: {
    providerName: SECURITY_PROVIDER;
    providerSymbol: string;
  };
}

const portfolioKey = (providerName: string, providerSymbol: string) => `${providerName}:${providerSymbol}`;

export const searchSecurities = async ({
  query,
  limit = 20,
  user,
  portfolioId,
  assetClass,
}: SearchOptions): Promise<SecuritySearchResultFormatted[]> => {
  logger.info(`Searching securities for: ${query}${assetClass ? ` (class=${assetClass})` : ''}`);

  // Validate input
  if (!query) {
    logger.info('Search query too short or empty');
    return [];
  }

  try {
    const provider = dataProviderFactory.getProvider();
    const searchResults = await provider.searchSecurities(query, { assetClass });

    // Compose two filters:
    //   1. Drop classes the product doesn't support end-to-end (cash, options, …)
    //   2. Honour the UI filter (post-filter is defense in depth — composite already
    //      skips the irrelevant provider, but some providers return mixed-class hits).
    const supportedResults = searchResults.filter(
      (r) => SUPPORTED_ASSET_CLASSES.includes(r.assetClass) && (!assetClass || r.assetClass === assetClass),
    );

    // Apply limit if specified
    let limitedResults = limit ? supportedResults.slice(0, limit) : supportedResults;

    // If portfolioId is provided, check which securities are already in the portfolio
    if (portfolioId) {
      const holdings = (await Holdings.findAll({
        where: { portfolioId },
        attributes: ['securityId'], // Only fetch what we need from Holdings
        include: [
          {
            model: Securities,
            as: 'security',
            attributes: ['providerName', 'providerSymbol'],
          },
          {
            model: Portfolios,
            as: 'portfolio',
            attributes: [], // Don't fetch any portfolio data, only use for filtering
            where: { userId: user.id },
            required: true,
          },
        ],
      })) as unknown as HoldingProviderLookup[];

      // Set of `${providerName}:${providerSymbol}` tuples already held in this portfolio.
      // Keying on symbol alone would yield false positives when the same ticker exists
      // under multiple providers (common with crypto).
      const portfolioKeys = new Set(
        holdings
          .map((h) => (h.security ? portfolioKey(h.security.providerName, h.security.providerSymbol) : null))
          .filter((key): key is string => key !== null),
      );

      limitedResults = limitedResults.map((result) => ({
        ...result,
        isInPortfolio: portfolioKeys.has(portfolioKey(result.providerName, result.providerSymbol)),
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
