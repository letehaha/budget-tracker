import { ASSET_CLASS, SECURITY_PROVIDER } from '@bt/shared/types/investments';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import alpha from 'alphavantage';

const mockedAlpha = jest.mocked(alpha);
const mockAlphaVantage = mockedAlpha.getMockImplementation()!({ key: 'foo' });
const mockedSearch = jest.mocked(mockAlphaVantage.data.search);

describe('GET /investments/securities/search', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
  });

  it('should search for securities using Alpha Vantage provider', async () => {
    // Mock AlphaVantage API response in their exact format
    mockedSearch.mockResolvedValue({
      bestMatches: [
        {
          '1. symbol': 'AAPL',
          '2. name': 'Apple Inc.',
          '3. type': 'Equity',
          '4. region': 'United States',
          '5. marketOpen': '09:30',
          '6. marketClose': '16:00',
          '7. timezone': 'UTC-04',
          '8. currency': 'USD',
          '9. matchScore': '1.0000',
        },
        {
          '1. symbol': 'GOOG',
          '2. name': 'Alphabet Inc.',
          '3. type': 'Equity',
          '4. region': 'United States',
          '5. marketOpen': '09:30',
          '6. marketClose': '16:00',
          '7. timezone': 'UTC-04',
          '8. currency': 'USD',
          '9. matchScore': '0.8000',
        },
      ],
    });

    const results = await helpers.searchSecurities({ payload: { query: 'apple' }, raw: true });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      symbol: 'AAPL',
      name: 'Apple Inc.',
      assetClass: ASSET_CLASS.stocks,
      providerName: SECURITY_PROVIDER.alphavantage,
      currencyCode: 'USD',
      exchangeName: 'United States',
    });
    expect(mockedSearch).toHaveBeenCalledWith('apple');
  });

  it('should return empty array when no securities found', async () => {
    // Mock AlphaVantage response with no matches
    mockedSearch.mockResolvedValue({
      bestMatches: [],
    });

    const results = await helpers.searchSecurities({ payload: { query: 'nonexistent' }, raw: true });

    expect(results).toHaveLength(0);
    expect(mockedSearch).toHaveBeenCalledWith('nonexistent');
  });

  it('should handle provider errors gracefully', async () => {
    // Mock AlphaVantage API error
    mockedSearch.mockRejectedValue(new Error('Alpha Vantage API error'));

    const results = await helpers.searchSecurities({ payload: { query: 'apple' }, raw: true });

    // Service should return empty array on provider error
    expect(results).toHaveLength(0);
  });

  it('handles validation', async () => {
    expect(
      (await helpers.searchSecurities({ payload: { query: 'a', limit: 'test-non-number' as unknown as number } }))
        .statusCode,
    ).toBe(ERROR_CODES.ValidationError);
  });
});
