import { redisKeyFormatter } from '@common/lib/redis';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type IExchanges, type ITickers, restClient } from '@polygon.io/client-js';
import { redisClient } from '@root/redis';
import { SECURITIES_SYNC_LOCK_KEY } from '@services/investments/securities-sync.service';
import * as helpers from '@tests/helpers';

jest.mock('@polygon.io/client-js', () => ({
  restClient: jest.fn().mockReturnValue({
    reference: {
      tickers: jest.fn(),
      exchanges: jest.fn(),
    },
  }),
}));

const mockedRestClient = jest.mocked(restClient);
const mockApi = mockedRestClient.getMockImplementation()!('test');
const mockedExchanges = jest.mocked(mockApi.reference.exchanges);
const mockedTickers = jest.mocked(mockApi.reference.tickers);

describe('POST /investing/sync/securities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully start the sync, add new securities, and release the lock', async () => {
    const setSpy = jest.spyOn(redisClient, 'set');
    const delSpy = jest.spyOn(redisClient, 'del');

    mockedExchanges.mockResolvedValue({
      status: 'OK',
      request_id: 'mock-exchange-id',
      results: [{ mic: 'XNYS', type: 'exchange' }],
    } as IExchanges);

    mockedTickers.mockResolvedValue({
      status: 'OK',
      request_id: 'mock-ticker-id',
      count: 2,
      results: [
        { ticker: 'AAPL', name: 'Apple Inc.', currency_name: 'USD' },
        { ticker: 'GOOG', name: 'Alphabet Inc.', currency_name: 'USD' },
      ],
    } as ITickers);

    const response = await helpers.triggerSecuritiesSync();
    expect(response.statusCode).toBe(202);

    await helpers.sleep(1_000);

    const securitiesInDb = await helpers.getAllSecurities({ raw: true });
    expect(securitiesInDb).toHaveLength(2);
    expect(securitiesInDb.map((s) => s.symbol)).toEqual(['AAPL', 'GOOG']);

    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(delSpy).toHaveBeenCalledWith(redisKeyFormatter(SECURITIES_SYNC_LOCK_KEY));
  }, 15_000);

  it('should return 2xx when sync is already in progress, but data provider should not be called', async () => {
    mockedExchanges.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                results: [{ mic: 'XNYS', type: 'exchange' }],
              } as IExchanges),
            500, // This process will take 500ms to "complete"
          ),
        ),
    );

    helpers.triggerSecuritiesSync();

    // Wait just a moment to ensure the first process has started and acquired the lock.
    await helpers.sleep(10);

    // Even if process is locked, endpoint will return success response, cause we don't
    // catch the error. We can check that locking works by checks below
    await helpers.triggerSecuritiesSync();

    // We called sync two times, but data should be loaded only once
    expect(mockedExchanges).toHaveBeenCalledTimes(1);
  });

  it('should only add securities that do not already exist', async () => {
    mockedExchanges.mockResolvedValue({
      status: 'OK',
      request_id: 'mock-exchange-id',
      results: [{ mic: 'XNYS', type: 'exchange' }],
    } as IExchanges);

    mockedTickers
      .mockResolvedValueOnce({
        status: 'OK',
        request_id: 'mock-ticker-id',
        count: 1,
        results: [{ ticker: 'AAPL', name: 'Apple Inc.', currency_name: 'USD' }],
      } as ITickers)
      .mockResolvedValueOnce({
        status: 'OK',
        request_id: 'mock-ticker-id',
        count: 2,
        results: [
          { ticker: 'AAPL', name: 'Apple Inc.', currency_name: 'USD' },
          { ticker: 'GOOG', name: 'Alphabet Inc.', currency_name: 'USD' },
        ],
      } as ITickers);

    await helpers.triggerSecuritiesSync();
    await helpers.sleep(300); // wait after sync for data to settle
    await helpers.triggerSecuritiesSync();
    await helpers.sleep(300); // wait after sync for data to settle

    const securitiesInDb = await helpers.getAllSecurities({ raw: true });
    expect(securitiesInDb).toHaveLength(2);
    expect(securitiesInDb.map((s) => s.symbol)).toEqual(['AAPL', 'GOOG']);
  });

  it('should complete successfully when the provider returns no tickers', async () => {
    mockedExchanges.mockResolvedValue({
      status: 'OK',
      request_id: 'mock-exchange-id',
      results: [{ mic: 'XNYS', type: 'exchange' }],
    } as IExchanges);

    mockedTickers.mockResolvedValue({
      status: 'OK',
      request_id: 'mock-ticker-id',
      count: 2,
      results: [],
    } as ITickers);

    await helpers.triggerSecuritiesSync();

    const securitiesInDb = await helpers.getAllSecurities({ raw: true });
    expect(securitiesInDb).toHaveLength(0);
  });
});
