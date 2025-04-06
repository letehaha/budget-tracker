import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Edit currency exchange rate controller', () => {
  it('should fail editing currency exchange rates for non-connected currencies', async () => {
    const pairs = [
      { baseCode: 'USD', quoteCode: 'EUR', rate: 0.85 },
      { baseCode: 'EUR', quoteCode: 'USD', rate: 1.18 },
    ];
    const res = await helpers.editCurrencyExchangeRate({ pairs });
    expect(res.statusCode).toEqual(ERROR_CODES.NotFoundError);
  });

  describe('', () => {
    beforeEach(async () => {
      // Setup: Ensure the user has the necessary currencies
      await helpers.addUserCurrencies({ currencyCodes: ['USD', 'EUR', 'GBP'] });
    });

    it('should successfully edit currency exchange rates', async () => {
      const allCurrencies = await helpers.getAllCurrencies();
      const eur = allCurrencies.find((i) => i.code === 'EUR')!;

      await helpers.makeRequest({
        method: 'post',
        url: '/user/currencies',
        payload: {
          currencies: [{ currencyId: eur.id }],
        },
        raw: false,
      });

      const pairs = [
        { baseCode: 'USD', quoteCode: 'EUR', rate: 0.85 },
        { baseCode: 'EUR', quoteCode: 'USD', rate: 1.18 },
      ];

      const res = await helpers.editCurrencyExchangeRate({ pairs });

      expect(res.statusCode).toEqual(200);

      // Verify that edition request returned edited currencies
      const returnedValues = helpers.extractResponse(res);
      expect(['USD', 'EUR'].every((code) => returnedValues.map((r) => r.baseCode === code))).toBe(true);

      const usdEurRate = returnedValues.find((rate) => rate.baseCode === 'USD' && rate.quoteCode === 'EUR')!;
      const eurUsdRate = returnedValues.find((rate) => rate.baseCode === 'EUR' && rate.quoteCode === 'USD')!;

      expect(usdEurRate.rate).toBeCloseTo(0.85);
      expect(eurUsdRate.rate).toBeCloseTo(1.18);
    });

    it('should return validation error if invalid currency code is provided', async () => {
      const pairs = [{ baseCode: 'USD', quoteCode: 'INVALID', rate: 1.5 }];

      const res = await helpers.editCurrencyExchangeRate({ pairs });

      expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
    });

    it('should return error when trying to edit pair with same base and quote currency', async () => {
      const pairs = [{ baseCode: 'USD', quoteCode: 'USD', rate: 1 }];

      const res = await helpers.editCurrencyExchangeRate({ pairs });

      expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
    });

    it('should require opposite pair rate change', async () => {
      const pairs = [{ baseCode: 'USD', quoteCode: 'EUR', rate: 0.85 }];

      const res = await helpers.editCurrencyExchangeRate({ pairs });

      expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
    });

    it('should return error when trying to edit non-existent currency pair', async () => {
      const pairs = [
        { baseCode: 'USD', quoteCode: 'JPY', rate: 110 },
        { baseCode: 'JPY', quoteCode: 'USD', rate: 0.0091 },
      ];

      const res = await helpers.editCurrencyExchangeRate({ pairs });

      expect(res.statusCode).toEqual(ERROR_CODES.NotFoundError);
    });
  });
});
