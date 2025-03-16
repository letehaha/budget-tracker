import { expect } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Add user currencies', () => {
  it('should successfully add user currencies', async () => {
    const allCurrencies = await helpers.getAllCurrencies();
    const uah = allCurrencies.find((i) => i.code === 'UAH')!;
    const eur = allCurrencies.find((i) => i.code === 'EUR')!;

    const currencies = [
      { currencyId: uah.id, exchangeRate: 37, liveRateUpdate: true },
      { currencyId: eur.id, exchangeRate: 0.85, liveRateUpdate: false },
    ];

    const res = await helpers.addUserCurrenciesWithRates({
      currencies,
      raw: false,
    });

    expect(res.statusCode).toEqual(200);

    // Verify that addition request returned added currencies
    const returnedValues = helpers.extractResponse(res).currencies;
    expect(returnedValues.length).toBe(2);
    expect(currencies.every((c) => returnedValues.some((i) => i.currencyId === c.currencyId))).toBe(true);

    const returnedUah = returnedValues.find((c) => c.currencyId === uah.id)!;
    const returnedEur = returnedValues.find((c) => c.currencyId === eur.id)!;

    expect(returnedUah.exchangeRate).toBe(37);
    expect(returnedUah.liveRateUpdate).toBe(true);
    expect(returnedEur.exchangeRate).toBe(0.85);
    expect(returnedEur.liveRateUpdate).toBe(false);
  });

  it('should return validation error if invalid currency code is provided', async () => {
    const res = await helpers.addUserCurrencies({ currencyIds: [1111111999] });

    expect(res.statusCode).toEqual(ERROR_CODES.NotFoundError);
  });

  it('should return validation error if exchange rate is negative', async () => {
    const allCurrencies = await helpers.getAllCurrencies();
    const uah = allCurrencies.find((i) => i.code === 'UAH')!;

    const res = await helpers.addUserCurrenciesWithRates({
      currencies: [{ currencyId: uah.id, exchangeRate: -1 }],
      raw: false,
    });

    expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
  });

  it('should successfully add currencies without optional fields', async () => {
    const allCurrencies = await helpers.getAllCurrencies();
    const uah = allCurrencies.find((i) => i.code === 'UAH')!;

    const res = await helpers.addUserCurrenciesWithRates({
      currencies: [{ currencyId: uah.id }],
      raw: false,
    });

    expect(res.statusCode).toEqual(200);
    const returnedValues = helpers.extractResponse(res).currencies;
    expect(returnedValues.length).toBe(1);
    expect(returnedValues[0]!.currencyId).toBe(uah.id);
    expect(returnedValues[0]!.exchangeRate).toBeNull();
    expect(returnedValues[0]!.liveRateUpdate).toBe(true);
  });

  it('should successfully resolve when trying to add duplicate currencies', async () => {
    // First, add a currency
    const allCurrencies = await helpers.getAllCurrencies();
    const uah = allCurrencies.find((i) => i.code === 'UAH')!;
    const currencies = [{ currencyId: uah.id }];

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
    expect(helpers.extractResponse(res).alreadyExistingIds).toEqual(currencies.map((i) => i.currencyId));
  });

  it('should successfully resolve when trying to add a currency same as base currency', async () => {
    const currencies = [{ currencyId: global.BASE_CURRENCY.id }];

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
