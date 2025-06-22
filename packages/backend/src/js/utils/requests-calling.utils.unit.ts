import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import _ from 'lodash';

import { paginate, paginateWithNextUrl, withRetry } from './requests-calling.utils';

// Define a generic type for our mock data to keep tests clean and typed.
type MockItem = { id: number };

describe('paginateWithNextUrl', () => {
  it('should fetch all items across multiple pages', async () => {
    const mockFetchData =
      jest.fn<(limit: number, cursor?: string) => Promise<{ data: MockItem[]; nextUrl?: string }>>();

    mockFetchData
      .mockResolvedValueOnce({
        data: [{ id: 1 }],
        nextUrl: 'http://api.com/items?cursor=abc',
      })
      .mockResolvedValueOnce({
        data: [{ id: 2 }],
        nextUrl: undefined,
      });

    const result = await paginateWithNextUrl({
      fetchData: mockFetchData,
      pageSize: 1,
    });

    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    expect(mockFetchData).toHaveBeenCalledTimes(2);
    expect(mockFetchData).toHaveBeenNthCalledWith(1, 1, undefined);
    expect(mockFetchData).toHaveBeenNthCalledWith(2, 1, 'abc');
  });

  it('should propagate errors from the fetchData function', async () => {
    const mockFetchData = jest.fn<() => Promise<{ data: MockItem[]; nextUrl?: string }>>();
    mockFetchData.mockRejectedValue(new Error('API Error'));

    await expect(paginateWithNextUrl({ fetchData: mockFetchData, pageSize: 10 })).rejects.toThrow('API Error');
  });
});

describe('paginate', () => {
  it.each<{ pageSize: number; dataSize: number; fetchCalls: number }>`
    pageSize | dataSize | fetchCalls
    ${10}    | ${0}     | ${1}
    ${10}    | ${1}     | ${1}
    ${10}    | ${10}    | ${2}
    ${10}    | ${11}    | ${2}
    ${10}    | ${20}    | ${3}
  `(
    'should correctly paginate data (pageSize: $pageSize, dataSize: $dataSize)',
    async ({ pageSize, dataSize, fetchCalls }) => {
      const fullData = _.range(dataSize);
      const mockFetchData = jest.fn<(offset: number, count: number) => Promise<number[]>>(
        (offset: number, count: number) => Promise.resolve(_.slice(fullData, offset, offset + count)),
      );

      const result = await paginate({
        pageSize,
        fetchData: mockFetchData,
      });

      expect(result).toEqual(fullData);
      expect(mockFetchData).toHaveBeenCalledTimes(fetchCalls);
    },
  );
});

describe('withRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each<{ failAttempts: number; maxRetries: number }>`
    failAttempts | maxRetries
    ${0}         | ${5}
    ${1}         | ${5}
    ${5}         | ${5}
  `(
    'should retry the correct number of times (fails: $failAttempts, max: $maxRetries)',
    async ({ failAttempts, maxRetries }) => {
      const mockFn = jest.fn<(attempt: number) => string | Promise<string>>((attempt: number) => {
        if (attempt < failAttempts) throw new Error(`Attempt ${attempt} fails`);
        return 'Success';
      });

      const resultPromise = withRetry(mockFn, { maxRetries, delay: 1000 });

      // Fast-forward through all pending timeouts
      for (let i = 0; i < failAttempts; i++) {
        await Promise.resolve(); // Allow any pending microtasks to run
        jest.advanceTimersByTime(1000);
      }

      const result = await resultPromise;

      expect(result).toBe('Success');
      expect(mockFn).toHaveBeenCalledTimes(failAttempts + 1);
    },
  );

  it('should stop retrying if onError returns false', async () => {
    const exitAfterAttempts = 2;
    const mockFn = jest.fn<() => never>(() => {
      throw new Error('Failure');
    });
    const mockOnError = jest.fn((_err: unknown, attempt: number) => attempt < exitAfterAttempts);

    const resultPromise = withRetry(mockFn, { maxRetries: 5, onError: mockOnError, delay: 1000 });

    // Fast-forward through the timeouts until we hit our exit condition
    for (let i = 0; i <= exitAfterAttempts; i++) {
      await Promise.resolve(); // Allow any pending microtasks to run
      jest.advanceTimersByTime(1000);
    }

    await expect(resultPromise).rejects.toThrow('Failure');
    expect(mockFn).toHaveBeenCalledTimes(exitAfterAttempts + 1);
  });
});
