import { EXCHANGE_RATE_PROVIDER_TYPE } from '@bt/shared/types';
import { afterAll, afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import ExchangeRates from '@models/exchange-rates.model';
import * as helpers from '@tests/helpers';
import { Sequelize } from 'sequelize';

type SelfPairRow = {
  baseCode: string;
  quoteCode: string;
  rate: number;
  date: Date;
  source: EXCHANGE_RATE_PROVIDER_TYPE;
};

/**
 * Regression test for issue #305.
 *
 * In production / fresh dev deployments the `ExchangeRates` table is populated
 * entirely by the runtime providers (currency-rates-api, api-layer). Those
 * providers never emit a self-pair row (`USD → USD = 1`) – see
 * `merge-provider-rates.ts`, which explicitly skips `quoteCode === baseCurrency`.
 *
 * The test environment hides the bug because the legacy
 * `1664386509637-exchange-rates.js` migration seeds deterministic rates for every
 * base × quote combination, including self-pairs.
 *
 * The suite simulates a fresh prod deployment by deleting all self-pair rows
 * before exercising `POST /user/currencies/base`. The endpoint must succeed
 * because the rate of any currency against itself is trivially 1 – no DB lookup
 * is needed.
 */
describe('POST /user/currencies/base – issue #305 regression', () => {
  const selfPairWhere = Sequelize.where(Sequelize.col('baseCode'), Sequelize.col('quoteCode'));
  let removedSelfPairs: SelfPairRow[] = [];

  beforeEach(async () => {
    removedSelfPairs = (await ExchangeRates.findAll({
      where: selfPairWhere,
      raw: true,
    })) as unknown as SelfPairRow[];
    await ExchangeRates.destroy({ where: selfPairWhere });
  });

  afterEach(async () => {
    const restored = await ExchangeRates.bulkCreate(removedSelfPairs);
    if (restored.length !== removedSelfPairs.length) {
      throw new Error(`afterEach restore incomplete: expected ${removedSelfPairs.length} rows, got ${restored.length}`);
    }
    removedSelfPairs = [];
  });

  // Safety net in case a beforeEach throws after the DELETE but before the
  // afterEach above has a chance to restore (Jest skips afterEach when
  // beforeEach throws). Without this, every later suite that relies on the
  // seeded self-pair rows would fail with no clue why.
  afterAll(async () => {
    if (removedSelfPairs.length > 0) {
      await ExchangeRates.bulkCreate(removedSelfPairs);
      removedSelfPairs = [];
    }
  });

  it('lets a fresh user set their base currency even when no self-pair rate row exists', async () => {
    const handle = await helpers.signUpSecondUser();

    const res = await helpers.asUser({
      cookies: handle.cookies,
      fn: () => helpers.setBaseCurrencyForActiveUser({ currencyCode: 'GBP' }),
    });

    expect(res.statusCode).toEqual(200);

    const userCurrencies = await helpers.asUser({
      cookies: handle.cookies,
      fn: () => helpers.getUserCurrencies(),
    });
    const baseCurrency = userCurrencies.find((c) => c.isDefaultCurrency);
    expect(baseCurrency?.currencyCode).toBe('GBP');
    expect(baseCurrency?.exchangeRate).toBe(1);
  });

  it('rejects a second call once the user already has a base currency', async () => {
    const handle = await helpers.signUpSecondUser();

    await helpers.asUser({
      cookies: handle.cookies,
      fn: async () => {
        const first = await helpers.setBaseCurrencyForActiveUser({ currencyCode: 'GBP' });
        expect(first.statusCode).toEqual(200);
      },
    });

    const second = await helpers.asUser({
      cookies: handle.cookies,
      fn: () => helpers.setBaseCurrencyForActiveUser({ currencyCode: 'EUR' }),
    });

    expect(second.statusCode).toEqual(ERROR_CODES.ValidationError);
  });

  it('rejects an unknown currency code', async () => {
    const handle = await helpers.signUpSecondUser();

    const res = await helpers.asUser({
      cookies: handle.cookies,
      fn: () => helpers.setBaseCurrencyForActiveUser({ currencyCode: 'ZZZ' }),
    });

    expect(res.statusCode).toEqual(ERROR_CODES.ValidationError);
  });
});
