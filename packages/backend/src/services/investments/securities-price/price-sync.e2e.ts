import { SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type IAggsGroupedDaily, restClient } from '@polygon.io/client-js';
import * as helpers from '@tests/helpers';
import { endOfDay, format, startOfDay, subDays } from 'date-fns';

// Get the mock implementation from the global setup
const mockedRestClient = jest.mocked(restClient);
const mockApi = mockedRestClient.getMockImplementation()!('test');
const mockedGroupedDaily = jest.mocked(mockApi.stocks.aggregatesGroupedDaily);

describe('POST /investments/sync/prices/daily', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully fetch and create new prices for existing securities', async () => {
    // Setup: Create securities in the DB that we expect to get prices for
    await helpers.seedSecuritiesViaSync([
      { symbol: 'AAPL', name: 'Apple Inc.' },
      { symbol: 'GOOG', name: 'Alphabet Inc.' },
    ]);

    // Mock: Configure the Polygon client to return price data for our securities
    const syncDate = subDays(new Date(), 1);
    const syncDateStr = format(syncDate, 'yyyy-MM-dd');
    const timestamp = syncDate.getTime();

    mockedGroupedDaily.mockResolvedValue({
      status: 'OK',
      results: [
        { T: 'AAPL', c: 150.5, t: timestamp },
        { T: 'GOOG', c: 2800.75, t: timestamp },
      ],
      resultsCount: 2,
    } as IAggsGroupedDaily);

    // Trigger the price sync
    const response = await helpers.triggerDailyPriceSync();

    expect(response.statusCode).toBe(200);
    expect(helpers.extractResponse(response)).toEqual({
      fetchedCount: 2,
      createdCount: 2,
      updatedCount: 0,
      ignoredCount: 0,
    });

    const pricesInDb = await helpers.getSecuritiesPricesByDate({
      params: {
        startDate: startOfDay(syncDate),
        endDate: endOfDay(syncDate),
      },
      raw: true,
    });

    expect(pricesInDb).toHaveLength(2);
    expect(pricesInDb).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          priceClose: '150.5000000000',
          date: syncDateStr,
        }),
        expect.objectContaining({
          priceClose: '2800.7500000000',
          date: syncDateStr,
        }),
      ]),
    );
  });

  it('should ignore prices for securities that are not in the database', async () => {
    // Only create one of the securities we'll get a price for.
    await helpers.seedSecuritiesViaSync([{ symbol: 'MSFT', name: 'Microsoft Corp.' }]);
    const syncDate = subDays(new Date(), 1);
    const timestamp = syncDate.getTime();

    // Return prices for one known and one unknown security.
    mockedGroupedDaily.mockResolvedValue({
      status: 'OK',
      results: [
        { T: 'MSFT', c: 300.0, t: timestamp },
        { T: 'NVDA', c: 800.0, t: timestamp }, // This security does not exist in our DB
      ],
      resultsCount: 2,
    } as IAggsGroupedDaily);

    const response = await helpers.triggerDailyPriceSync();

    // Verify the counts in the response and check the DB.
    expect(response.statusCode).toBe(200);
    expect(response.body.response.fetchedCount).toBe(2);
    expect(response.body.response.createdCount).toBe(1);
    expect(response.body.response.ignoredCount).toBe(1);

    const pricesInDb = await helpers.getSecuritiesPricesByDate({
      params: {
        startDate: startOfDay(syncDate),
        endDate: endOfDay(syncDate),
      },
      raw: true,
    });

    expect(pricesInDb).toHaveLength(1);
    expect(pricesInDb[0]!.priceClose).toBe('300.0000000000');
  });

  it('should update the price if a record for that security and date already exists', async () => {
    // Setup: Seed the security in the database.
    const [security] = await helpers.seedSecuritiesViaSync([{ symbol: 'TSLA', name: 'Tesla Inc.' }]);
    const syncDate = subDays(new Date(), 2);
    const syncDateStr = format(syncDate, 'yyyy-MM-dd');

    // First Sync: Run the sync with the "old" price data.
    mockedGroupedDaily.mockResolvedValue({
      status: 'OK',
      results: [{ T: 'TSLA', c: 900.0, t: syncDate.getTime() }], // The old price
      resultsCount: 1,
    } as IAggsGroupedDaily);

    await helpers.triggerDailyPriceSync({ payload: { date: syncDateStr } });

    // Second Sync: Re-run the sync for the same date with "new" price data.
    mockedGroupedDaily.mockResolvedValue({
      status: 'OK',
      results: [{ T: 'TSLA', c: 955.55, t: syncDate.getTime() }], // The new price
      resultsCount: 1,
    } as IAggsGroupedDaily);

    await helpers.triggerDailyPriceSync({ payload: { date: syncDateStr } });

    // Verify that the database contains only one record and it has the updated price.
    const pricesInDb = await helpers.getSecuritiesPricesByDate({
      params: {
        securityId: security!.id,
        startDate: startOfDay(syncDate),
        endDate: endOfDay(syncDate),
      },
      raw: true,
    });

    expect(pricesInDb).toHaveLength(1); // Crucially, no new record was created.
    expect(pricesInDb[0]!.priceClose).toBe('955.5500000000'); // The price was updated.
    expect(pricesInDb[0]!.source).toBe(SECURITY_PROVIDER.polygon);
  });

  it.todo('should handle 403 error when trying to access too old data');
  it.todo('should handle 429 error when trying to access API too often');
});
