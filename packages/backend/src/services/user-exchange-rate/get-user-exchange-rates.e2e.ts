import { EXCHANGE_RATE_PROVIDER_TYPE } from '@bt/shared/types';
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { logger } from '@js/utils';
import { connection } from '@models/index';
import * as helpers from '@tests/helpers';
import {
  API_LAYER_ENDPOINT_REGEX,
  CURRENCY_RATES_API_ENDPOINT_REGEX,
  FRANKFURTER_ENDPOINT_REGEX,
} from '@tests/mocks/exchange-rates/endpoints';
import { createCallsCounter, createOverride } from '@tests/mocks/helpers';
import { startOfDay, subYears } from 'date-fns';

/**
 * Drives `getExchangeRate` through the real HTTP surface (`GET /user/currencies/rates`
 * → getUserExchangeRates → getExchangeRate per connected currency → base). These
 * tests pin the cross-rate cache + fallback/missing semantics that the unit of
 * exchange-rate resolution relies on.
 *
 * EXOTIC is a currency only ApiLayer covers, so the historical seed never supplies
 * a rate for it — each test fully controls its `ExchangeRates` rows. The base
 * currency stays the suite default (AED): for an X→AED cross-rate the AED leg is
 * identical across two reads in the same test, so it cancels in a rate ratio and
 * we never need to know its seeded value.
 */
const EXOTIC = 'XAF';

// logger.warn / logger.error are overloaded, so jest infers call args as `never`.
// Read recorded calls through a widened tuple for substring assertions.
const spyCalls = (spy: ReturnType<typeof jest.spyOn>): Array<[unknown, ...unknown[]]> =>
  spy.mock.calls as unknown as Array<[unknown, ...unknown[]]>;
const loggedWith = (spy: ReturnType<typeof jest.spyOn>, substring: string): boolean =>
  spyCalls(spy).some(([message]) => typeof message === 'string' && message.includes(substring));

const insertRate = async ({
  quoteCode,
  date,
  rate,
  source,
}: {
  quoteCode: string;
  date: Date;
  rate: number;
  source: EXCHANGE_RATE_PROVIDER_TYPE;
}) => {
  await connection.sequelize.query(
    `INSERT INTO "ExchangeRates" ("baseCode", "quoteCode", "date", "rate", "source")
     VALUES ('USD', :quoteCode, :date, :rate, :source)`,
    { replacements: { quoteCode, date, rate, source } },
  );
};

const deleteTodayRates = async () => {
  const today = startOfDay(new Date());
  await connection.sequelize.query(`DELETE FROM "ExchangeRates" WHERE date >= :today`, { replacements: { today } });
};

const deleteRatesFor = async (quoteCode: string) => {
  await connection.sequelize.query(`DELETE FROM "ExchangeRates" WHERE "quoteCode" = :quoteCode`, {
    replacements: { quoteCode },
  });
};

describe('getUserExchangeRates (cross-rate cache + fallback semantics)', () => {
  let currencyRatesApiOverride: ReturnType<typeof createOverride>;
  let frankfurterOverride: ReturnType<typeof createOverride>;
  let apiLayerOverride: ReturnType<typeof createOverride>;

  let currencyRatesApiCounter: ReturnType<typeof createCallsCounter>;
  let frankfurterCounter: ReturnType<typeof createCallsCounter>;
  let apiLayerCounter: ReturnType<typeof createCallsCounter>;

  beforeAll(() => {
    currencyRatesApiOverride = createOverride(global.mswMockServer, CURRENCY_RATES_API_ENDPOINT_REGEX);
    frankfurterOverride = createOverride(global.mswMockServer, FRANKFURTER_ENDPOINT_REGEX);
    apiLayerOverride = createOverride(global.mswMockServer, API_LAYER_ENDPOINT_REGEX);

    currencyRatesApiCounter = createCallsCounter(global.mswMockServer, CURRENCY_RATES_API_ENDPOINT_REGEX);
    frankfurterCounter = createCallsCounter(global.mswMockServer, FRANKFURTER_ENDPOINT_REGEX);
    apiLayerCounter = createCallsCounter(global.mswMockServer, API_LAYER_ENDPOINT_REGEX);
  });

  beforeEach(async () => {
    await helpers.addUserCurrencies({ currencyCodes: [EXOTIC] });
    // Start every test from a clean today + no leftover exotic rows.
    await deleteTodayRates();
    await deleteRatesFor(EXOTIC);
  });

  afterEach(async () => {
    global.mswMockServer.resetHandlers();
    currencyRatesApiCounter.reset();
    frankfurterCounter.reset();
    apiLayerCounter.reset();
    jest.restoreAllMocks();
    await deleteRatesFor(EXOTIC);
  });

  const readExoticRate = async (): Promise<number | undefined> => {
    const rows = await helpers.getCurrenciesRates({ codes: [EXOTIC] });
    return rows.find((row) => row.baseCode === EXOTIC)?.rate;
  };

  const failAllProviders = () => {
    currencyRatesApiOverride.setOverride({ status: 500 });
    frankfurterOverride.setOverride({ status: 500 });
    apiLayerOverride.setOverride({ status: 500 });
  };

  it('does not serve a stale fallback from cache after the real rate for the date lands', async () => {
    const today = startOfDay(new Date());
    const FALLBACK_RATE = 600; // USD->XAF on an old date (the stale approximation)
    const FRESH_RATE = 300; // USD->XAF that lands for TODAY after the first read

    // Only an old-date row exists, so loadRate(XAF, today) must fall back to it.
    await insertRate({
      quoteCode: EXOTIC,
      date: subYears(today, 5),
      rate: FALLBACK_RATE,
      source: EXCHANGE_RATE_PROVIDER_TYPE.API_LAYER,
    });

    // Providers down → on-demand backfill for today produces no exact rate, so
    // getExchangeRate resolves XAF via the stale fallback (pre-fix: caches it).
    failAllProviders();

    const staleRate = await readExoticRate();
    expect(staleRate).toBeGreaterThan(0); // fallback served, not errored

    // The real USD->XAF rate for TODAY now lands in the DB (a later cron/sync would
    // do this). source=api-layer also marks today comprehensive, so the second read
    // won't re-fetch — it must read this fresh row straight from the DB.
    await insertRate({
      quoteCode: EXOTIC,
      date: today,
      rate: FRESH_RATE,
      source: EXCHANGE_RATE_PROVIDER_TYPE.API_LAYER,
    });

    // Second read within the cache TTL must reflect the fresh exact rate, NOT the
    // cached stale fallback. XAF moved 600 -> 300, so the cross-rate must ~double
    // (the AED leg is unchanged across both reads and cancels in the ratio).
    const freshRate = await readExoticRate();
    expect(freshRate).toBeGreaterThan(staleRate!);
    expect(freshRate! / staleRate!).toBeCloseTo(FALLBACK_RATE / FRESH_RATE, 1);
  });

  it('returns the most-recent fallback rate (and warns) when providers are down and no exact rate exists', async () => {
    await insertRate({
      quoteCode: EXOTIC,
      date: subYears(startOfDay(new Date()), 5),
      rate: 600,
      source: EXCHANGE_RATE_PROVIDER_TYPE.API_LAYER,
    });
    failAllProviders();
    const warnSpy = jest.spyOn(logger, 'warn');

    const rate = await readExoticRate();

    // The stale fallback is used as an approximation rather than erroring out.
    expect(rate).toBeGreaterThan(0);
    expect(loggedWith(warnSpy, 'using fallback rates')).toBe(true);
  });

  it('omits a currency that has no rate on any date, and logs it', async () => {
    // No XAF row anywhere + providers down → XAF is genuinely unobtainable for today.
    failAllProviders();
    const errorSpy = jest.spyOn(logger, 'error');

    const rows = await helpers.getCurrenciesRates({ codes: [EXOTIC] });

    // getExchangeRate threw (genuinely missing); getUserExchangeRates drops it + logs.
    expect(rows.find((row) => row.baseCode === EXOTIC)).toBeUndefined();
    expect(loggedWith(errorSpy, EXOTIC)).toBe(true);
  });

  it('does not hit any provider when today rates already exist for both legs', async () => {
    const today = startOfDay(new Date());
    // Both legs exact for today → getExchangeRate resolves from the DB and must not
    // trigger the on-demand backfill at all.
    await insertRate({ quoteCode: EXOTIC, date: today, rate: 300, source: EXCHANGE_RATE_PROVIDER_TYPE.API_LAYER });
    await insertRate({
      quoteCode: global.BASE_CURRENCY!.code,
      date: today,
      rate: 3.6,
      source: EXCHANGE_RATE_PROVIDER_TYPE.API_LAYER,
    });

    currencyRatesApiCounter.reset();
    frankfurterCounter.reset();
    apiLayerCounter.reset();

    const rate = await readExoticRate();

    expect(rate).toBeGreaterThan(0);
    expect(currencyRatesApiCounter.count).toBe(0);
    expect(frankfurterCounter.count).toBe(0);
    expect(apiLayerCounter.count).toBe(0);
  });
});
