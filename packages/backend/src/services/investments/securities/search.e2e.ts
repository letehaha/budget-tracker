import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('GET /investments/securities/search', () => {
  beforeEach(async () => {
    jest.clearAllMocks();

    await helpers.seedSecuritiesViaSync([
      { symbol: 'AAPL', name: 'Apple Inc.' },
      { symbol: 'AMD', name: 'AMD' },
      { symbol: 'GOOG', name: 'Alphabet Inc.' },
    ]);
  });

  it('should search for securities', async () => {
    // All of securities have "a" in their symbol or name
    expect((await helpers.searchSecurities({ payload: { query: 'a' }, raw: true })).length).toBe(3);

    // Only AAPL has "aa"
    expect((await helpers.searchSecurities({ payload: { query: 'aa' }, raw: true })).length).toBe(1);

    // Nothing has "test"
    expect((await helpers.searchSecurities({ payload: { query: 'test' }, raw: true })).length).toBe(0);

    // All 3 have "a", but since limit=1, only 1 should be returned
    expect((await helpers.searchSecurities({ payload: { query: 'a', limit: 1 }, raw: true })).length).toBe(1);
  });

  it('handles validation', async () => {
    expect(
      (await helpers.searchSecurities({ payload: { query: 'a', limit: 'test-non-number' as unknown as number } }))
        .statusCode,
    ).toBe(ERROR_CODES.ValidationError);
  });
});
