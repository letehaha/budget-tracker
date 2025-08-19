import { until } from '@common/helpers';
import { jest } from '@jest/globals';
import type Securities from '@models/investments/Securities.model';
import { FmpClient, type FmpSearchResult } from '@root/services/investments/data-providers/clients/fmp-client';
import { syncDailyPrices } from '@root/services/investments/securities-price/price-sync.service';
import { addSecurityFromSearch } from '@root/services/investments/securities/add-from-search.service';
import * as getSecuritiesService from '@root/services/investments/securities/get-all';
import { searchSecurities as _searchSecurities } from '@root/services/investments/securities/search.service';

import { type MakeRequestReturn, makeRequest } from '../common';

export async function triggerSecuritiesSync<R extends boolean | undefined = false>({
  raw,
}: {
  raw?: R;
} = {}): Promise<MakeRequestReturn<{ message: string }, R>> {
  return makeRequest({
    method: 'post',
    url: '/investments/sync/securities',
    raw,
  });
}
export async function getAllSecurities<R extends boolean | undefined = false>({
  raw,
}: {
  raw?: R;
} = {}) {
  return makeRequest<Awaited<ReturnType<typeof getSecuritiesService.getSecurities>>, R>({
    method: 'get',
    url: '/investments/securities',
    raw,
  });
}

export async function triggerDailyPriceSync<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload?: { date: string };
  raw?: R;
} = {}) {
  return makeRequest<Awaited<ReturnType<typeof syncDailyPrices>>, R>({
    method: 'post',
    url: '/investments/sync/prices/daily',
    payload,
    raw,
  });
}

type SeedSecurityPayload = {
  symbol: string;
  name: string;
  currency_name?: string;
  type?: string;
};

/**
 * Seeds the database with securities using the new search-based approach.
 * This is the preferred way to create securities in tests.
 *
 * @param securitiesToSeed - An array of security objects to be "created" via search.
 * @returns A promise that resolves to the array of created Sequelize security models.
 */
export async function seedSecurities(securitiesToSeed: SeedSecurityPayload[]) {
  const { dataProviderFactory } = await import('@root/services/investments/data-providers/provider-factory');
  // Access private property to clear cache
  dataProviderFactory.clearCache();
  // Get the global FMP client mock
  const mockedFmpClient = jest.mocked(FmpClient);
  mockedFmpClient.mockReset();
  const mockFmpSearch = jest.fn<() => Promise<FmpSearchResult[]>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedFmpClient.mockImplementation(() => ({ search: mockFmpSearch }) as any);

  // For each security, mock the search and add it to database
  const createdSecurities: Securities[] = [];

  for (const security of securitiesToSeed) {
    // Mock FMP search to return this security
    mockFmpSearch.mockResolvedValue([
      {
        symbol: security.symbol,
        name: security.name,
        currency: security.currency_name || 'USD',
        stockExchange: 'NASDAQ Global Select', // Default exchange
        exchangeShortName: 'NASDAQ',
      },
    ]);

    // Search for the security (which will use our mock)
    const searchResults = await searchSecurities({
      payload: { query: security.symbol },
      raw: true,
    });

    if (searchResults.length === 0) {
      throw new Error(`Failed to get search result for ${security.symbol}`);
    }

    // Add the security to database using the search result
    const { security: createdSecurity } = await addSecurityFromSearch({
      searchResult: searchResults[0]!,
    });

    createdSecurities.push(createdSecurity);
    mockFmpSearch.mockReset();
  }

  // Wait until the database reflects all changes
  await until(
    async () => {
      const securities = await getAllSecurities({ raw: true });
      return securities.length >= securitiesToSeed.length;
    },
    { timeout: 5000, interval: 100 },
  );

  return createdSecurities;
}

export async function searchSecurities<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload: { query: string; limit?: number };
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof _searchSecurities>>, R>({
    method: 'get',
    url: '/investments/securities/search',
    payload,
    raw,
  });
}
