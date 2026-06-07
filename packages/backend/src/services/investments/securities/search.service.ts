import { UserModel } from '@bt/shared/types';
import {
  ASSET_CLASS,
  SECURITY_PROVIDER,
  SUPPORTED_ASSET_CLASSES,
  type SecuritySearchResult,
} from '@bt/shared/types/investments';
import { CustomError } from '@js/errors';
import { logger } from '@js/utils';
import Holdings from '@models/investments/holdings.model';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';

import { dataProviderFactory } from '../data-providers';
import { securityIdentityKey } from './identity';

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
    symbol: string | null;
    currencyCode: string;
    assetClass: ASSET_CLASS;
  };
}

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
    //   2. Honour the UI filter (post-filter is defense in depth – composite already
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
            attributes: ['providerName', 'providerSymbol', 'symbol', 'currencyCode', 'assetClass'],
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

      // Set of identity keys already held in this portfolio. The key shape
      // differs by assetClass – see `securityIdentityKey` for rationale.
      const portfolioKeys = new Set(
        holdings
          .map((h) => (h.security ? securityIdentityKey(h.security) : null))
          .filter((key): key is string => key !== null),
      );

      limitedResults = limitedResults.map((result) => ({
        ...result,
        isInPortfolio: portfolioKeys.has(securityIdentityKey(result)),
      }));
    }

    logger.info(`Found ${limitedResults.length} securities for query: ${query}`);
    return limitedResults;
  } catch (error) {
    // CustomError instances carry a deliberate HTTP status + API error code
    // (e.g. cryptoProviderNotConfigured → 503). Surface them to the controller
    // so the UI can render an actionable hint instead of a generic empty list.
    if (error instanceof CustomError) {
      throw error;
    }

    logger.error({ message: 'Securities search failed', error: error as Error });

    // Unexpected provider failures fall through to "no results" so the UI
    // stays usable rather than throwing a 500 at the user.
    return [];
  }
};
