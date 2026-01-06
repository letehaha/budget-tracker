import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Add user currencies', () => {
  it('should successfully add user currencies', async () => {
    const allCurrencies = await helpers.getAllCurrencies();
    const uah = allCurrencies.find((i) => i.code === 'UAH')!;
    const eur = allCurrencies.find((i) => i.code === 'EUR')!;

    const currencies = [
      { currencyCode: uah.code, exchangeRate: 37, liveRateUpdate: true },
      { currencyCode: eur.code, exchangeRate: 0.85, liveRateUpdate: false },
    ];

    const res = await helpers.addUserCurrenciesWithRates({
      currencies,
      raw: false,
    });

    expect(res.statusCode).toEqual(200);

    // Verify that addition request returned added currencies
    const returnedValues = helpers.extractResponse(res).currencies;
    expect(returnedValues.length).toBe(2);
    expect(currencies.every((c) => returnedValues.some((i) => i.currencyCode === c.currencyCode))).toBe(true);

    const returnedUah = returnedValues.find((c) => c.currencyCode === uah.code)!;
    const returnedEur = returnedValues.find((c) => c.currencyCode === eur.code)!;

    expect(returnedUah.exchangeRate).toBe(37);
    expect(returnedUah.liveRateUpdate).toBe(true);
    expect(returnedEur.exchangeRate).toBe(0.85);
    expect(returnedEur.liveRateUpdate).toBe(false);
  });

  it('should return validation error if non-existent currency code is provided', async () => {
    const res = await helpers.addUserCurrencies({ currencyCodes: ['ZZZ'] });

    expect(res.statusCode).toEqual(ERROR_CODES.NotFoundError);
  });

  it('should return validation error if exchange rate is negative', async () => {
    const allCurrencies = await helpers.getAllCurrencies();
    const uah = allCurrencies.find((i) => i.code === 'UAH')!;

    const res = await helpers.addUserCurrenciesWithRates({
      currencies: [{ currencyCode: uah.code, exchangeRate: -1 }],
      raw: false,
    });

    expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
  });

  it('should successfully add currencies without optional fields', async () => {
    const allCurrencies = await helpers.getAllCurrencies();
    const uah = allCurrencies.find((i) => i.code === 'UAH')!;

    const res = await helpers.addUserCurrenciesWithRates({
      currencies: [{ currencyCode: uah.code }],
      raw: false,
    });

    expect(res.statusCode).toEqual(200);
    const returnedValues = helpers.extractResponse(res).currencies;
    expect(returnedValues.length).toBe(1);
    expect(returnedValues[0]!.currencyCode).toBe(uah.code);
    expect(returnedValues[0]!.exchangeRate).toBeNull();
    expect(returnedValues[0]!.liveRateUpdate).toBe(true);
  });

  it('should successfully resolve when trying to add duplicate currencies', async () => {
    // First, add a currency
    const allCurrencies = await helpers.getAllCurrencies();
    const uah = allCurrencies.find((i) => i.code === 'UAH')!;
    const currencies = [{ currencyCode: uah.code }];

    await helpers.addUserCurrenciesWithRates({
      currencies,
      raw: false,
    });

    // Try to add the same currency again
    const res = await helpers.addUserCurrenciesWithRates({
      currencies,
      raw: false,
    });

    expect(res.statusCode).toEqual(200);
    expect(helpers.extractResponse(res).alreadyExistingCodes).toEqual(currencies.map((i) => i.currencyCode));
  });

  it('should successfully resolve when trying to add a currency same as base currency', async () => {
    const currencies = [{ currencyCode: global.BASE_CURRENCY.code }];

    const res = await helpers.addUserCurrenciesWithRates({
      currencies,
      raw: false,
    });

    expect(res.statusCode).toEqual(200);
  });

  it('should return validation error when currencies array is empty', async () => {
    const res = await helpers.addUserCurrenciesWithRates({
      currencies: [],
      raw: false,
    });

    expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
  });
});
