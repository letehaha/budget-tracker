import { until } from '@common/helpers';
import { jest } from '@jest/globals';
import { type IExchanges, type ITickers, restClient } from '@polygon.io/client-js';
import { syncDailyPrices } from '@root/services/investments/securities-price/price-sync.service';
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
 * Seeds the database with securities by mocking and running the actual sync process.
 * This is the preferred way to create securities in tests.
 *
 * @param securitiesToSeed - An array of security objects to be "returned" by the mock API.
 * @returns A promise that resolves to the array of created Sequelize security models.
 */
export async function seedSecuritiesViaSync(securitiesToSeed: SeedSecurityPayload[]) {
  // Get the mock instances that were set up globally in setupIntegrationTests.ts
  const mockedRestClient = jest.mocked(restClient);
  const mockApi = mockedRestClient.getMockImplementation()!('test');
  const mockedExchanges = jest.mocked(mockApi.reference.exchanges);
  const mockedTickers = jest.mocked(mockApi.reference.tickers);

  // Mock the API responses for the sync process
  mockedExchanges.mockResolvedValue({
    status: 'OK',
    results: [{ mic: 'XNYS', name: '(Test) New York Stock Exchange', type: 'exchange' }],
  } as IExchanges);

  mockedTickers.mockResolvedValue({
    status: 'OK',
    count: securitiesToSeed.length,
    results: securitiesToSeed.map((s) => ({
      ticker: s.symbol,
      name: s.name,
      currency_name: s.currency_name || 'USD',
      type: s.type || 'CS', // Default to Common Stock
    })),
  } as ITickers);

  // Trigger the actual sync endpoint
  await triggerSecuritiesSync();

  // Wait until the database reflects the change. This is more reliable than a fixed sleep.
  await until(
    async () => {
      const securities = await getAllSecurities({ raw: true });
      return securities.length === securitiesToSeed.length;
    },
    { timeout: 5000, interval: 100 },
  );

  // Return the newly created securities from the DB
  return getAllSecurities({ raw: true });
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
