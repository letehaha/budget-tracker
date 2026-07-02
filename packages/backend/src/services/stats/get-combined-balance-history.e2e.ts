import {
  ASSET_CLASS,
  EXCHANGE_RATE_PROVIDER_TYPE,
  INVESTMENT_TRANSACTION_CATEGORY,
  SECURITY_PROVIDER,
  TRANSACTION_TYPES,
  VEHICLE_CLASS,
} from '@bt/shared/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import Balances from '@models/balances.model';
import ExchangeRates from '@models/exchange-rates.model';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import UserExchangeRates from '@models/user-exchange-rates.model';
import { API_LAYER_BASE_CURRENCY_CODE } from '@services/exchange-rates/constants';
import * as helpers from '@tests/helpers';
import { format, subDays } from 'date-fns';
import { Op } from 'sequelize';

import { CombinedBalanceHistoryItem } from './get-combined-balance-history';

describe('[Stats] Combined balance history', () => {
  // `ExchangeRates` / `UserExchangeRates` survive test truncation (they are seed
  // data — see `SEED_DATA_TABLES`). Blocks below delete AED/EUR rows to force a
  // known conversion (or a 1:1 fallback). Those deletions would otherwise leak
  // into every later suite — e.g. portfolio-transfer tests that resolve `USD→AED`
  // for today on demand and would see it permanently missing once the source-gate
  // treats the date as already "comprehensive". Snapshot the AED/EUR rows on entry
  // and re-insert them on exit so deleted seed rows are put back. Restoring at the
  // FILE level (not per-describe) is deliberate: the venture/vehicle blocks rely on
  // the cleared state left by the cross-currency block, so the table must only be
  // healed after the whole file has run.
  const FX_SNAPSHOT_QUOTES = ['AED', 'EUR'];
  let fxSnapshot: {
    baseCode: string;
    quoteCode: string;
    date: Date;
    rate: number;
    source: EXCHANGE_RATE_PROVIDER_TYPE;
  }[] = [];
  let userFxSnapshot: { userId: number; baseCode: string; quoteCode: string; date: Date; rate: number }[] = [];

  beforeAll(async () => {
    fxSnapshot = (
      await ExchangeRates.findAll({
        where: { baseCode: API_LAYER_BASE_CURRENCY_CODE, quoteCode: { [Op.in]: FX_SNAPSHOT_QUOTES } },
        raw: true,
      })
    ).map(({ baseCode, quoteCode, date, rate, source }) => ({ baseCode, quoteCode, date, rate, source }));
    userFxSnapshot = (await UserExchangeRates.findAll({ where: { userId: 1 }, raw: true })).map(
      ({ userId, baseCode, quoteCode, date, rate }) => ({ userId, baseCode, quoteCode, date, rate }),
    );
  });

  // Re-insert (ignoring still-present rows) rather than wipe-then-restore: a wipe
  // would also drop today-dated rows fetched mid-file, which is what later suites
  // need. This only puts back the seed rows this file deleted.
  afterAll(async () => {
    if (fxSnapshot.length > 0) {
      await ExchangeRates.bulkCreate(fxSnapshot, { ignoreDuplicates: true });
    }
    if (userFxSnapshot.length > 0) {
      await UserExchangeRates.bulkCreate(userFxSnapshot, { ignoreDuplicates: true });
    }
  });

  // Shared by the cross-currency and cash-balance describes.
  // `ExchangeRates` survives test truncation (seed data — see
  // `SEED_DATA_TABLES`), so any test that seeds AED/EUR rows leaves them visible
  // to the next test unless wiped explicitly. `UserExchangeRates` is wiped for
  // the default user (`userId=1`) by the same call so per-user FX overrides don't
  // leak either.
  const FX_QUOTE_CODES_TOUCHED = ['AED', 'EUR'];
  const wipeFxState = async () => {
    await ExchangeRates.destroy({
      where: {
        baseCode: API_LAYER_BASE_CURRENCY_CODE,
        quoteCode: { [Op.in]: FX_QUOTE_CODES_TOUCHED },
      },
    });
    await UserExchangeRates.destroy({ where: { userId: 1 } });
  };

  it('Returns correct combined balance data for accounts only', async () => {
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
      raw: true,
    });

    // Create transactions to generate balance history
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 500,
        transactionType: TRANSACTION_TYPES.income,
        time: subDays(new Date(), 1).toISOString(),
      }),
      raw: true,
    });

    const data = await helpers.getCombinedBalanceHistory({ raw: true });

    const record = data[0]!;

    expect(data.length).toBeGreaterThan(0);
    // Should have account balance data
    expect(record).toHaveProperty('accountsBalance');
    expect(record).toHaveProperty('portfoliosBalance', 0);
    expect(record).toHaveProperty('venturesBalance', 0);
    expect(record).toHaveProperty('vehiclesBalance', 0);
    expect(record).toHaveProperty('loansBalance', 0);
    expect(record).toHaveProperty('totalBalance');
    expect(record.totalBalance).toBe(
      record.accountsBalance +
        record.portfoliosBalance +
        record.venturesBalance +
        record.vehiclesBalance +
        record.loansBalance,
    );
  });

  it('Returns correct combined balance data with date filtering', async () => {
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
      raw: true,
    });

    // Create transactions spanning multiple days
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 500,
        transactionType: TRANSACTION_TYPES.income,
        time: subDays(new Date(), 3).toISOString(),
      }),
      raw: true,
    });

    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 200,
        transactionType: TRANSACTION_TYPES.income,
        time: subDays(new Date(), 1).toISOString(),
      }),
      raw: true,
    });

    // Filter to get data from specific date range
    const fromDate = format(subDays(new Date(), 4), 'yyyy-MM-dd');
    const toDate = format(subDays(new Date(), 2), 'yyyy-MM-dd');

    const data = await helpers.getCombinedBalanceHistory({
      from: fromDate,
      to: toDate,
      raw: true,
    });

    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('accountsBalance');
    expect(data[0]).toHaveProperty('portfoliosBalance', 0);
    expect(data[0]).toHaveProperty('totalBalance');
  });

  it('Returns correct combined balance data for multiple accounts', async () => {
    const account1 = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
      raw: true,
    });
    const account2 = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 2000 }),
      raw: true,
    });

    // Create transactions for both accounts
    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account1.id,
        amount: 100,
        transactionType: TRANSACTION_TYPES.income,
        time: subDays(new Date(), 1).toISOString(),
      }),
      raw: true,
    });

    await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account2.id,
        amount: 200,
        transactionType: TRANSACTION_TYPES.income,
        time: subDays(new Date(), 1).toISOString(),
      }),
      raw: true,
    });

    const data = await helpers.getCombinedBalanceHistory({ raw: true });

    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('accountsBalance');
    expect(data[0]).toHaveProperty('portfoliosBalance', 0);
    expect(data[0]).toHaveProperty('totalBalance');
    // Should aggregate both accounts
    expect(data[0]!.accountsBalance).toBeGreaterThan(1000); // Should include both accounts
  });

  it('Returns empty array when no data exists', async () => {
    const data = await helpers.getCombinedBalanceHistory({ raw: true });
    expect(data).toEqual([]);
  });

  it('Validates date parameters', async () => {
    const response = await helpers.makeRequest({
      method: 'get',
      url: '/stats/combined-balance-history?from=invalid-date',
    });

    expect(response.statusCode).toBe(422);
  });

  it('Returns correct balance for today even when no Balance record exists for today', async () => {
    // Create an account (this auto-creates a Balance record for today)
    const account = await helpers.createAccount({
      payload: helpers.buildAccountPayload({
        initialBalance: 1000,
      }),
      raw: true,
    });

    // Update the balance record's date to yesterday to simulate the scenario
    // where balance exists for yesterday but not for today
    const yesterday = subDays(new Date(), 1);
    yesterday.setHours(0, 0, 0, 0);

    await Balances.update({ date: yesterday }, { where: { accountId: account.id } });

    // Get combined balance history for a range that includes both yesterday and today
    const fromDate = format(subDays(new Date(), 7), 'yyyy-MM-dd');
    const toDate = format(new Date(), 'yyyy-MM-dd');

    const data = await helpers.getCombinedBalanceHistory({
      from: fromDate,
      to: toDate,
      raw: true,
    });

    expect(data.length).toBeGreaterThan(0);

    const todayDate = toDate;
    const yesterdayDate = format(yesterday, 'yyyy-MM-dd');

    // Verify yesterday's entry exists with balance 1000
    const yesterdayEntry = data.find((item: CombinedBalanceHistoryItem) => item.date === yesterdayDate)!;
    expect(yesterdayEntry).toBeDefined();
    expect(yesterdayEntry.accountsBalance).toBe(1000);

    // Find today's entry - this is the key test
    const todayEntry = data.find((item: CombinedBalanceHistoryItem) => item.date === todayDate)!;

    // Today should have a balance entry (this is what's failing in production)
    expect(todayEntry).toBeDefined();

    // Today's balance should be 1000 (carried forward from yesterday)
    // This is the bug: it returns 0 instead of 1000
    expect(todayEntry.accountsBalance).toBe(1000);
    expect(todayEntry.totalBalance).toBe(1000);
  });

  it('Does not create phantom balance spike when pre-range balance differs from first in-range record', async () => {
    // Scenario: Account A had 8500 before the range but its first in-range
    // balance record is 0 (at day -3, NOT the earliest date in the range).
    // The old code only checked accounts present on the FIRST date in the result,
    // so Account A would be classified as "not in range" and get a stale 8500
    // backfill injected — creating a phantom spike.
    //
    // We use API-created accounts (so amounts are stored correctly) and only
    // manipulate dates via Balances.update to avoid Money conversion issues.

    const accountA = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 8500 }),
      raw: true,
    });
    const accountB = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 2000 }),
      raw: true,
    });

    const day10Ago = subDays(new Date(), 10);
    const day5Ago = subDays(new Date(), 5);
    const day3Ago = subDays(new Date(), 3);
    day10Ago.setHours(0, 0, 0, 0);
    day5Ago.setHours(0, 0, 0, 0);
    day3Ago.setHours(0, 0, 0, 0);

    // Move Account A's balance record to day -10 (pre-range)
    await Balances.update({ date: day10Ago }, { where: { accountId: accountA.id } });

    // Move Account B's balance record to day -5 (earliest in-range date)
    await Balances.update({ date: day5Ago }, { where: { accountId: accountB.id } });

    // Create Account A's in-range record at day -3 with amount 0
    // (0 is safe from any Money conversion — 0 cents = $0 regardless)
    await (Balances as any).create({ accountId: accountA.id, date: day3Ago, amount: 0 });

    // Query range: last 7 days
    const fromDate = format(subDays(new Date(), 7), 'yyyy-MM-dd');
    const toDate = format(new Date(), 'yyyy-MM-dd');

    const data = await helpers.getCombinedBalanceHistory({
      from: fromDate,
      to: toDate,
      raw: true,
    });

    expect(data.length).toBeGreaterThan(0);

    // Account A has a record at day -3 (0) which is NOT the first date in range.
    // The aggregation forward-fills 0 for all prior dates.
    // Account B has 2000, forward-filled throughout.
    // Total should be 2000, NOT 10500 (which would be the phantom spike).
    const firstEntry = data[0]!;
    expect(firstEntry.accountsBalance).toBe(2000);

    // Verify no entry exceeds 2000 — Account A's stale pre-range 8500
    // should never appear in the range
    for (const entry of data) {
      expect(entry.accountsBalance).toBeLessThanOrEqual(2000);
    }
  });

  it('Correctly backfills accounts that have NO records in the range', async () => {
    // Account A has a balance record only before the range — it should be
    // backfilled at the start of the range and forward-filled throughout.
    const accountA = await helpers.createAccount({
      payload: helpers.buildAccountPayload({ initialBalance: 5000 }),
      raw: true,
    });

    // Move Account A's balance record to well before the range
    const preRangeDate = subDays(new Date(), 20);
    preRangeDate.setHours(0, 0, 0, 0);
    await Balances.update({ date: preRangeDate }, { where: { accountId: accountA.id } });

    // Query range: last 7 days (Account A has no records here at all)
    const fromDate = format(subDays(new Date(), 7), 'yyyy-MM-dd');
    const toDate = format(new Date(), 'yyyy-MM-dd');

    const data = await helpers.getCombinedBalanceHistory({
      from: fromDate,
      to: toDate,
      raw: true,
    });

    expect(data.length).toBeGreaterThan(0);

    // Account A should be backfilled with $5000 across the entire range
    for (const entry of data) {
      expect(entry.accountsBalance).toBe(5000);
    }
  });

  describe('Portfolio crypto intraday bucketing', () => {
    it('collapses same-UTC-day SecurityPricing rows onto one daily bucket, latest timestamp wins', async () => {
      // Test strategy: compare two API calls against the same portfolio. The
      // first call has only the LATE intraday row (price 67000) seeded — that's
      // the expected daily-bucket value. The second call adds an EARLIER row
      // (price 50000) on the same UTC day. If the new bucketing logic works,
      // the late row still wins and both responses match. If bucketing broke
      // (e.g. early row overwrites the late one), the second response would
      // drop to the 50000-derived value. The investment transaction defaults
      // to currencyCode='USD' regardless of the security's currency, so the
      // exchange rate to AED applies in both calls and cancels out — we only
      // care that the LATE price won the bucket, not its absolute base-currency
      // value.
      const pickedDay = subDays(new Date(), 5);
      const pickedDayUtcMidnight = Date.UTC(
        pickedDay.getUTCFullYear(),
        pickedDay.getUTCMonth(),
        pickedDay.getUTCDate(),
      );
      const dayKey = format(new Date(pickedDayUtcMidnight), 'yyyy-MM-dd');

      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Crypto Portfolio' }),
        raw: true,
      });

      const cryptoSecurity = await Securities.create({
        symbol: 'BTC',
        providerSymbol: 'bitcoin',
        currencyCode: 'USD',
        cryptoCurrencyCode: 'BTC',
        providerName: SECURITY_PROVIDER.coingecko,
        assetClass: ASSET_CLASS.crypto,
        name: 'Bitcoin',
      });

      await helpers.createHolding({
        payload: { portfolioId: portfolio.id, securityId: cryptoSecurity.id },
      });

      // Drain any background sync from createHolding (it may also seed rows
      // via the new bucketing path) so the assertions below operate on
      // exactly the two rows we control.
      await new Promise((resolve) => setTimeout(resolve, 200));
      await SecurityPricing.destroy({ where: { securityId: cryptoSecurity.id } });

      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: cryptoSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          date: dayKey,
          quantity: '1',
          price: '50000',
          fees: '0',
        },
        raw: true,
      });

      const fromDate = format(subDays(new Date(), 8), 'yyyy-MM-dd');
      const toDate = format(new Date(), 'yyyy-MM-dd');

      // Phase 1: only the 22:00 row exists — baseline expected value.
      await SecurityPricing.create({
        securityId: cryptoSecurity.id,
        date: new Date(pickedDayUtcMidnight + 22 * 60 * 60 * 1000),
        priceClose: '67000',
        source: SECURITY_PROVIDER.coingecko,
      });

      const baselineData = await helpers.getCombinedBalanceHistory({
        from: fromDate,
        to: toDate,
        raw: true,
      });
      const baselineEntry = (baselineData as CombinedBalanceHistoryItem[]).find((e) => e.date === dayKey);
      expect(baselineEntry).toBeDefined();
      const baselinePortfolio = baselineEntry!.portfoliosBalance;

      // Phase 2: add an EARLIER intraday row on the same UTC day. With correct
      // bucketing (the new `formatDate(price.date)` key + last-write-wins on
      // `pricesBySecurityAndDate.set`), the late row still wins → same value.
      // With the OLD `String(price.date)` key, both rows would create distinct
      // keys none of which match the daily `targetDate`, so the value would
      // fall back to costBasis and diverge from baseline.
      await SecurityPricing.create({
        securityId: cryptoSecurity.id,
        date: new Date(pickedDayUtcMidnight + 6 * 60 * 60 * 1000),
        priceClose: '50000',
        source: SECURITY_PROVIDER.coingecko,
      });

      const bothData = await helpers.getCombinedBalanceHistory({
        from: fromDate,
        to: toDate,
        raw: true,
      });
      const bothEntry = (bothData as CombinedBalanceHistoryItem[]).find((e) => e.date === dayKey);
      expect(bothEntry).toBeDefined();
      expect(bothEntry!.portfoliosBalance).toBe(baselinePortfolio);
    });
  });

  describe('Portfolio cross-currency conversion (USD-base ExchangeRates pivot)', () => {
    // Tests in this block need precise control over which rates exist when the
    // history endpoint runs, so `wipeFxState` runs BOTH before each test (to
    // clear any prior describe's leak) and inside `seedHoldingAndPriceHistory`
    // AFTER the investment-transaction insert (because `calculateRefAmount`
    // lazily fetches rates and stores them — without that second wipe, every
    // test would observe an unexpected USD→AED row).
    const seedHoldingAndPriceHistory = async ({
      portfolioId,
      securityId,
      pickedDay,
      dayKey,
      price = '100',
      cashCurrencyCode = 'USD',
    }: {
      portfolioId: string;
      securityId: string;
      pickedDay: Date;
      dayKey: string;
      price?: string;
      /** Settlement currency of the buy (= the security's currency); the buy is funded in it. */
      cashCurrencyCode?: string;
    }) => {
      await helpers.createHolding({ payload: { portfolioId, securityId } });
      // Drain any background sync from createHolding before clobbering the
      // single SecurityPricing row this test relies on.
      await new Promise((resolve) => setTimeout(resolve, 200));
      await SecurityPricing.destroy({ where: { securityId } });

      await SecurityPricing.create({
        securityId,
        date: pickedDay,
        priceClose: price,
        source: SECURITY_PROVIDER.yahoo,
      });

      // `createInvestmentTransaction` → `calculateRefAmount` resolves
      // `<securityCurrency> → AED (user base)` for `dayKey` through the real
      // `getExchangeRate`. Seed the USD-pivot legs up front so that resolve hits
      // a stored rate instead of a live provider fetch: once an earlier test has
      // made the date look "comprehensive", the on-demand fetch is skipped and an
      // absent rate throws — which would fail the holding setup, not the assertion.
      // These rows are ephemeral; the `wipeFxState()` below clears them before
      // each test seeds the rates it actually asserts on.
      await ExchangeRates.bulkCreate(
        [
          { baseCode: API_LAYER_BASE_CURRENCY_CODE, quoteCode: 'AED', rate: 1, date: pickedDay },
          { baseCode: API_LAYER_BASE_CURRENCY_CODE, quoteCode: 'EUR', rate: 1, date: pickedDay },
        ],
        { ignoreDuplicates: true },
      );

      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId,
          securityId,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          date: dayKey,
          quantity: '1',
          price,
          fees: '0',
        },
        raw: true,
      });

      // portfoliosBalance sums holdings market value and portfolio cash, so the
      // buy above leaves a negative cash leg of `price` in settlement currency.
      // Deposit the same amount in the same currency to net that leg to zero;
      // otherwise the negative cash would exactly cancel the holding and every
      // FX assertion in this block would collapse to 0 — these tests must verify
      // holdings FX conversion in isolation.
      await helpers.directCashTransaction({
        portfolioId,
        payload: { type: 'deposit', amount: price, currencyCode: cashCurrencyCode, date: dayKey },
        raw: true,
      });

      // The transaction-create flow calls `calculateRefAmount`, which lazily
      // hits the live FX provider and writes a row to `ExchangeRates`. Wipe
      // that row so each test asserts only against the rates it explicitly
      // seeds in the lines that follow.
      await wipeFxState();
    };

    beforeEach(wipeFxState);
    // Leave the FX tables cleared after every test in this block: the venture and
    // vehicle blocks that follow rely on the cleared state (no stray USD-pivot rate
    // leaking a non-1:1 conversion into their base-currency assertions).
    afterEach(wipeFxState);

    it('converts USD security holdings into the user base currency via stored USD-pivot rates', async () => {
      // Regression guard for the case where `ExchangeRates` is queried as
      // `baseCode = securityCurrency, quoteCode = userBase` — rows are seeded
      // as `baseCode = USD, quoteCode = X` so that direction never matches and
      // the lookup silently falls back to 1:1. This test pins both the lookup
      // direction AND the cross-rate maths by asserting an exact converted
      // value: with USD→AED = 4 and a USD-denominated holding worth $100, the
      // portfolio balance must be 400 AED, NOT 100 AED.
      const pickedDay = subDays(new Date(), 3);
      pickedDay.setUTCHours(0, 0, 0, 0);
      const dayKey = format(pickedDay, 'yyyy-MM-dd');

      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'USD Stocks' }),
        raw: true,
      });

      const usdSecurity = await Securities.create({
        symbol: 'AAPL',
        providerSymbol: 'AAPL',
        currencyCode: 'USD',
        providerName: SECURITY_PROVIDER.yahoo,
        assetClass: ASSET_CLASS.stocks,
        name: 'Apple Inc.',
      });

      await seedHoldingAndPriceHistory({
        portfolioId: portfolio.id,
        securityId: usdSecurity.id,
        pickedDay,
        dayKey,
      });

      // Round-number rate so the assertion is exact: 1 USD = 4 AED.
      await ExchangeRates.create({
        baseCode: API_LAYER_BASE_CURRENCY_CODE,
        quoteCode: 'AED',
        rate: 4,
        date: pickedDay,
      });

      const data = (await helpers.getCombinedBalanceHistory({
        from: format(subDays(pickedDay, 1), 'yyyy-MM-dd'),
        to: format(new Date(), 'yyyy-MM-dd'),
        raw: true,
      })) as CombinedBalanceHistoryItem[];

      const entry = data.find((e) => e.date === dayKey);
      expect(entry).toBeDefined();
      // 1 share * $100 * 4 AED/USD = 400 AED. The API serializer returns
      // decimals (not cents), so 400 is the expected value over the wire.
      expect(entry!.portfoliosBalance).toBe(400);
    });

    it('walks back to a rate from BEFORE the fetch window when none exists inside it', async () => {
      // Regression (Sentry MONEY-MATTER-BACKEND-7B): the per-day rate walk only saw
      // rates preloaded inside [windowStart, windowEnd]. A currency whose latest rate
      // predates the window had no in-window row, so the walk found nothing and the
      // value silently collapsed to 1:1. The lookup now seeds one anchor from before
      // the window. Here USD→AED exists only 20 days ago while the loader's lower bound
      // is ~11 days ago, so without the pre-window anchor this would wrongly read 100.
      const pickedDay = subDays(new Date(), 3);
      pickedDay.setUTCHours(0, 0, 0, 0);
      const dayKey = format(pickedDay, 'yyyy-MM-dd');

      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Pre-window walk-back portfolio' }),
        raw: true,
      });

      const usdSecurity = await Securities.create({
        symbol: 'NVDA',
        providerSymbol: 'NVDA',
        currencyCode: 'USD',
        providerName: SECURITY_PROVIDER.yahoo,
        assetClass: ASSET_CLASS.stocks,
        name: 'NVIDIA',
      });

      await seedHoldingAndPriceHistory({
        portfolioId: portfolio.id,
        securityId: usdSecurity.id,
        pickedDay,
        dayKey,
      });

      // Seed USD→AED ONLY 20 days ago — strictly before the loader's lower bound
      // (query window is day-4..today, so rates preload from ~day-11 onward).
      const preWindowDay = subDays(new Date(), 20);
      preWindowDay.setUTCHours(0, 0, 0, 0);
      await ExchangeRates.create({
        baseCode: API_LAYER_BASE_CURRENCY_CODE,
        quoteCode: 'AED',
        rate: 4,
        date: preWindowDay,
      });

      const data = (await helpers.getCombinedBalanceHistory({
        from: format(subDays(pickedDay, 1), 'yyyy-MM-dd'),
        to: format(new Date(), 'yyyy-MM-dd'),
        raw: true,
      })) as CombinedBalanceHistoryItem[];

      const entry = data.find((e) => e.date === dayKey);
      expect(entry).toBeDefined();
      // Pre-window anchor applied: 1 share * $100 * 4 AED/USD = 400 AED (not the 1:1 100).
      expect(entry!.portfoliosBalance).toBe(400);
    });

    it('prefers a UserExchangeRates override over the canonical USD-pivot rate', async () => {
      // System rate USD→AED = 4. User override (UserExchangeRates baseCode=USD,
      // quoteCode=AED) = 10. Override must win — this pins the precedence
      // through the real DB fetch (`buildUserRatesMap` short-circuiting the
      // USD-pivot cross-rate in `createGetExchangeRate`).
      const pickedDay = subDays(new Date(), 3);
      pickedDay.setUTCHours(0, 0, 0, 0);
      const dayKey = format(pickedDay, 'yyyy-MM-dd');

      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Override portfolio' }),
        raw: true,
      });

      const usdSecurity = await Securities.create({
        symbol: 'GOOG',
        providerSymbol: 'GOOG',
        currencyCode: 'USD',
        providerName: SECURITY_PROVIDER.yahoo,
        assetClass: ASSET_CLASS.stocks,
        name: 'Alphabet',
      });

      await seedHoldingAndPriceHistory({
        portfolioId: portfolio.id,
        securityId: usdSecurity.id,
        pickedDay,
        dayKey,
      });

      await ExchangeRates.create({
        baseCode: API_LAYER_BASE_CURRENCY_CODE,
        quoteCode: 'AED',
        rate: 4,
        date: pickedDay,
      });
      // UserExchangeRates is keyed on the global default user (userId=1 in the
      // integration setup). Insert directly so the test doesn't depend on the
      // edit-rate HTTP flow.
      await UserExchangeRates.create({
        userId: 1,
        baseCode: 'USD',
        quoteCode: 'AED',
        rate: 10,
        date: pickedDay,
      });

      const data = (await helpers.getCombinedBalanceHistory({
        from: format(subDays(pickedDay, 1), 'yyyy-MM-dd'),
        to: format(new Date(), 'yyyy-MM-dd'),
        raw: true,
      })) as CombinedBalanceHistoryItem[];

      const entry = data.find((e) => e.date === dayKey);
      expect(entry).toBeDefined();
      // Override rate 10 wins -> 1 * 100 * 10 = 1000 AED.
      expect(entry!.portfoliosBalance).toBe(1000);
    });

    it('includes non-base portfolio CASH converted via the USD-pivot cross-rate', async () => {
      // Cash held inside a portfolio in a non-base currency must be converted to
      // the user base just like security holdings. EUR cash, user base AED:
      // USD→EUR = 2, USD→AED = 4 -> EUR→AED = 2, so €100 of cash = 200 AED. This
      // also guards the currency-set extension: EUR is not a security currency
      // here, so it only reaches the USD-pivot loader via the cash leg.
      const pickedDay = subDays(new Date(), 3);
      pickedDay.setUTCHours(0, 0, 0, 0);
      const dayKey = format(pickedDay, 'yyyy-MM-dd');
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'EUR cash portfolio' }),
        raw: true,
      });

      // Ephemeral rates so the deposit's ref-amount computation resolves (for both
      // the event date and `new Date()`); wiped immediately after so the assertion
      // runs only against the rates seeded below.
      await ExchangeRates.bulkCreate(
        [
          { baseCode: API_LAYER_BASE_CURRENCY_CODE, quoteCode: 'EUR', rate: 1, date: pickedDay },
          { baseCode: API_LAYER_BASE_CURRENCY_CODE, quoteCode: 'AED', rate: 1, date: pickedDay },
          { baseCode: API_LAYER_BASE_CURRENCY_CODE, quoteCode: 'EUR', rate: 1, date: today },
          { baseCode: API_LAYER_BASE_CURRENCY_CODE, quoteCode: 'AED', rate: 1, date: today },
        ],
        { ignoreDuplicates: true },
      );

      // The cash deposit converts EUR→AED at write time, and getExchangeRate
      // refuses to convert a currency the user isn't connected to. A security
      // holding would connect it implicitly; a bare cash deposit needs it here.
      await helpers.addUserCurrencies({ currencyCodes: ['EUR'] });

      await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: { type: 'deposit', amount: '100', currencyCode: 'EUR', date: dayKey },
        raw: true,
      });

      await wipeFxState();

      await ExchangeRates.bulkCreate([
        { baseCode: API_LAYER_BASE_CURRENCY_CODE, quoteCode: 'EUR', rate: 2, date: pickedDay },
        { baseCode: API_LAYER_BASE_CURRENCY_CODE, quoteCode: 'AED', rate: 4, date: pickedDay },
      ]);

      const data = (await helpers.getCombinedBalanceHistory({
        from: format(subDays(pickedDay, 1), 'yyyy-MM-dd'),
        to: format(new Date(), 'yyyy-MM-dd'),
        raw: true,
      })) as CombinedBalanceHistoryItem[];

      const entry = data.find((e) => e.date === dayKey);
      expect(entry).toBeDefined();
      // €100 * (USD→AED 4 / USD→EUR 2) = 200 AED.
      expect(entry!.portfoliosBalance).toBe(200);
    });
  });

  describe('Venture deals', () => {
    it('Reflects deal principal + entryFee in venturesBalance with no events', async () => {
      const investmentDate = format(subDays(new Date(), 3), 'yyyy-MM-dd');
      await helpers.createVentureDeal({
        payload: {
          principal: '10000',
          entryFeePct: '0',
          investmentDate,
        },
        raw: true,
      });

      const data = (await helpers.getCombinedBalanceHistory({ raw: true })) as CombinedBalanceHistoryItem[];

      expect(data.length).toBeGreaterThan(0);
      const lastRecord = data[data.length - 1]!;
      expect(lastRecord.venturesBalance).toBe(10000);
      expect(lastRecord.totalBalance).toBe(
        lastRecord.accountsBalance + lastRecord.portfoliosBalance + lastRecord.venturesBalance,
      );
    });

    it('Returns zero venturesBalance on days before the investmentDate', async () => {
      const investmentDate = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      await helpers.createVentureDeal({
        payload: {
          principal: '5000',
          entryFeePct: '0',
          investmentDate,
        },
        raw: true,
      });

      const data = (await helpers.getCombinedBalanceHistory({
        from: format(subDays(new Date(), 5), 'yyyy-MM-dd'),
        to: format(new Date(), 'yyyy-MM-dd'),
        raw: true,
      })) as CombinedBalanceHistoryItem[];

      const before = data.find((e) => e.date === format(subDays(new Date(), 3), 'yyyy-MM-dd'));
      expect(before).toBeDefined();
      expect(before!.venturesBalance).toBe(0);

      const after = data.find((e) => e.date === format(new Date(), 'yyyy-MM-dd'));
      expect(after).toBeDefined();
      expect(after!.venturesBalance).toBe(5000);
    });
  });

  describe('Vehicles in combined balance history', () => {
    const buildVehiclePayload = (overrides: Record<string, unknown> = {}) => ({
      name: 'Vehicle for history',
      currencyCode: global.BASE_CURRENCY_CODE,
      make: 'Toyota',
      model: 'Corolla',
      year: 2022,
      vehicleClass: VEHICLE_CLASS.sedan,
      purchasePrice: 20000,
      // Purchase a few days ago, fully inside the seeded ExchangeRates window so
      // there's no missing-rate fallback even when the test currency is non-base.
      purchaseDate: format(subDays(new Date(), 4), 'yyyy-MM-dd'),
      ...overrides,
    });

    it('reports non-zero vehiclesBalance on days at/after purchase for a base-currency vehicle', async () => {
      // Base-currency vehicle dodges all FX lookups — the depreciation curve
      // alone drives vehiclesBalance, which must be > 0 from purchase onward.
      const vehicle = await helpers.createVehicle({
        ...buildVehiclePayload(),
        raw: true,
      });

      const fromDate = format(subDays(new Date(), 7), 'yyyy-MM-dd');
      const toDate = format(new Date(), 'yyyy-MM-dd');

      const data = (await helpers.getCombinedBalanceHistory({
        from: fromDate,
        to: toDate,
        raw: true,
      })) as CombinedBalanceHistoryItem[];

      expect(data.length).toBeGreaterThan(0);

      const purchaseDay = vehicle.purchaseDate;
      const postPurchase = data.filter((entry) => entry.date >= purchaseDay);
      expect(postPurchase.length).toBeGreaterThan(0);
      for (const entry of postPurchase) {
        expect(entry.vehiclesBalance).toBeGreaterThan(0);
        // Sanity: vehicle never appears richer than its purchase price.
        expect(entry.vehiclesBalance).toBeLessThanOrEqual(20000);
      }
    });

    it('excludes vehicle from vehiclesBalance once the account has excludeFromStats=true', async () => {
      // Seed a non-vehicle account so the combined history endpoint always
      // returns a non-empty series — otherwise excluding the only vehicle would
      // make the response `[]` and the vehiclesBalance assertions would pass
      // vacuously without proving exclusion actually happened.
      await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
        raw: true,
      });

      const vehicle = await helpers.createVehicle({
        ...buildVehiclePayload({ name: 'Hidden vehicle' }),
        raw: true,
      });

      // Confirm baseline first — without excludeFromStats the vehicle contributes.
      const before = (await helpers.getCombinedBalanceHistory({
        from: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
        to: format(new Date(), 'yyyy-MM-dd'),
        raw: true,
      })) as CombinedBalanceHistoryItem[];
      const baselineToday = before.find((e) => e.date === format(new Date(), 'yyyy-MM-dd'));
      expect(baselineToday).toBeDefined();
      expect(baselineToday!.vehiclesBalance).toBeGreaterThan(0);

      // Flip the vehicle account out of stats. `accountCategory` is omitted so
      // the controller's vehicle-category guard does not trip.
      const updateResponse = await helpers.updateAccount({
        id: vehicle.accountId,
        payload: { excludeFromStats: true },
      });
      expect(updateResponse.statusCode).toBe(200);

      const after = (await helpers.getCombinedBalanceHistory({
        from: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
        to: format(new Date(), 'yyyy-MM-dd'),
        raw: true,
      })) as CombinedBalanceHistoryItem[];

      expect(after.length).toBeGreaterThan(0);
      // With the only vehicle excluded, vehiclesBalance must be 0 across the range.
      for (const entry of after) {
        expect(entry.vehiclesBalance).toBe(0);
      }
    });

    it('contributes 0 to vehiclesBalance on days strictly before purchase', async () => {
      // Pick a window entirely BEFORE the vehicle's purchase date but still
      // inside the seeded ExchangeRates 10-day cushion. The series for those
      // days must be flat 0 because the vehicle did not exist yet.
      const purchaseDay = subDays(new Date(), 2);
      const purchaseDateStr = format(purchaseDay, 'yyyy-MM-dd');

      await helpers.createVehicle({
        ...buildVehiclePayload({
          name: 'Future-buy vehicle',
          purchaseDate: purchaseDateStr,
        }),
        raw: true,
      });

      const fromDate = format(subDays(new Date(), 7), 'yyyy-MM-dd');
      // Stop the range one day before purchase so every returned date is pre-purchase.
      const toDate = format(subDays(purchaseDay, 1), 'yyyy-MM-dd');

      const data = (await helpers.getCombinedBalanceHistory({
        from: fromDate,
        to: toDate,
        raw: true,
      })) as CombinedBalanceHistoryItem[];

      expect(data.length).toBeGreaterThan(0);
      for (const entry of data) {
        expect(entry.date < purchaseDateStr).toBe(true);
        expect(entry.vehiclesBalance).toBe(0);
      }
    });
  });

  describe('Loans in combined balance history', () => {
    it('reports negative loansBalance and keeps it out of accountsBalance', async () => {
      const cash = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
        raw: true,
      });

      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          currencyCode: global.BASE_CURRENCY_CODE,
          initialBalance: 50_000,
          originalPrincipal: 50_000,
        }),
        raw: true,
      });

      const fromDate = format(subDays(new Date(), 2), 'yyyy-MM-dd');
      const toDate = format(new Date(), 'yyyy-MM-dd');

      const data = (await helpers.getCombinedBalanceHistory({
        from: fromDate,
        to: toDate,
        raw: true,
      })) as CombinedBalanceHistoryItem[];

      const today = data.find((entry) => entry.date === toDate)!;
      expect(today).toBeDefined();

      // Outstanding loan balance is stored negative.
      expect(today.loansBalance).toBeLessThan(0);
      expect(Math.abs(today.loansBalance)).toBe(50_000);

      // The loan negative is routed into loansBalance, not accountsBalance.
      expect(today.accountsBalance).toBe(1000);

      // totalBalance sums all buckets algebraically: 1000 + (-50_000) = -49_000.
      expect(today.totalBalance).toBe(
        today.accountsBalance +
          today.portfoliosBalance +
          today.venturesBalance +
          today.vehiclesBalance +
          today.loansBalance,
      );
      expect(today.totalBalance).toBe(1000 - 50_000);

      // Only assert existence — these vars are otherwise unused, avoiding unused-var lint.
      expect(loan.id).toBeDefined();
      expect(cash.id).toBeDefined();
    });

    it('keeps loansBalance at 0 when the user has no loans', async () => {
      await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
        raw: true,
      });

      const data = (await helpers.getCombinedBalanceHistory({ raw: true })) as CombinedBalanceHistoryItem[];

      expect(data.length).toBeGreaterThan(0);
      for (const entry of data) {
        expect(entry.loansBalance).toBe(0);
      }
    });
  });

  describe('Portfolio cash balance', () => {
    // Base-currency (AED) cash so getExchangeRate short-circuits to 1 and these
    // assertions stay exact without any FX seeding. `wipeFxState` runs anyway
    // so a future non-base test added to this block can't be polluted by an
    // ambient AED/EUR row left over from another describe.
    beforeEach(wipeFxState);

    it('reflects a direct cash deposit in portfoliosBalance from the deposit day forward', async () => {
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Cash-only portfolio' }),
        raw: true,
      });

      const depositDay = format(subDays(new Date(), 3), 'yyyy-MM-dd');
      await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: { type: 'deposit', amount: '500', currencyCode: global.BASE_CURRENCY_CODE, date: depositDay },
        raw: true,
      });

      const data = (await helpers.getCombinedBalanceHistory({
        from: format(subDays(new Date(), 5), 'yyyy-MM-dd'),
        to: format(new Date(), 'yyyy-MM-dd'),
        raw: true,
      })) as CombinedBalanceHistoryItem[];

      // Before the deposit: no cash in the portfolio.
      const beforeDeposit = data.find((e) => e.date === format(subDays(new Date(), 4), 'yyyy-MM-dd'));
      expect(beforeDeposit).toBeDefined();
      expect(beforeDeposit!.portfoliosBalance).toBe(0);

      // On and after the deposit day: cash is tracked in base currency.
      const onDeposit = data.find((e) => e.date === depositDay);
      expect(onDeposit).toBeDefined();
      expect(onDeposit!.portfoliosBalance).toBe(500);

      const today = data.find((e) => e.date === format(new Date(), 'yyyy-MM-dd'))!;
      expect(today).toBeDefined();
      expect(today.portfoliosBalance).toBe(500);
      expect(today.totalBalance).toBe(
        today.accountsBalance + today.portfoliosBalance + today.venturesBalance + today.vehiclesBalance,
      );
    });

    it('does not smear post-window cash activity into a window that ends in the past', async () => {
      // Regression: `computePortfolioCashByDate` anchors on the CURRENT stored
      // cash, so cash rows must be fetched through today even when `to` is in
      // the past. If deltas between `to` and today were missing from the replay,
      // the seed `stored - sum(deltas)` would misattribute today's deposit as a
      // constant offset across every historical day (500 would read as 900),
      // and today's stored refTotalCash would be stamped onto the historical
      // `to` cell.
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Past-window portfolio' }),
        raw: true,
      });

      const inWindowDepositDay = format(subDays(new Date(), 5), 'yyyy-MM-dd');
      await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: { type: 'deposit', amount: '500', currencyCode: global.BASE_CURRENCY_CODE, date: inWindowDepositDay },
        raw: true,
      });
      // Second deposit dated TODAY — strictly after the requested window's `to`.
      await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: {
          type: 'deposit',
          amount: '400',
          currencyCode: global.BASE_CURRENCY_CODE,
          date: format(new Date(), 'yyyy-MM-dd'),
        },
        raw: true,
      });

      const data = (await helpers.getCombinedBalanceHistory({
        from: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
        to: format(subDays(new Date(), 2), 'yyyy-MM-dd'),
        raw: true,
      })) as CombinedBalanceHistoryItem[];

      // Before the in-window deposit: no cash yet.
      const beforeDeposit = data.find((e) => e.date === format(subDays(new Date(), 6), 'yyyy-MM-dd'));
      expect(beforeDeposit).toBeDefined();
      expect(beforeDeposit!.portfoliosBalance).toBe(0);

      // From the deposit day through the window end: exactly 500 on every day —
      // today's 400 deposit and today's stored cash total (900) must not leak
      // backwards into the historical window.
      const fromDepositOnward = data.filter((e) => e.date >= inWindowDepositDay);
      expect(fromDepositOnward.length).toBeGreaterThan(0);
      for (const entry of fromDepositOnward) {
        expect(entry.portfoliosBalance).toBe(500);
      }
    });

    it('conserves total net worth when cash moves from an account into a portfolio', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
        raw: true,
      });
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Funded portfolio' }),
        raw: true,
      });

      const today = format(new Date(), 'yyyy-MM-dd');
      await helpers.accountToPortfolioTransfer({
        portfolioId: portfolio.id,
        payload: { accountId: account.id, amount: '300', date: today },
        raw: true,
      });

      const data = (await helpers.getCombinedBalanceHistory({
        from: format(subDays(new Date(), 2), 'yyyy-MM-dd'),
        to: today,
        raw: true,
      })) as CombinedBalanceHistoryItem[];

      const todayEntry = data.find((e) => e.date === today)!;
      expect(todayEntry).toBeDefined();
      // Cash left the account and now lives in the portfolio.
      expect(todayEntry.accountsBalance).toBe(700);
      expect(todayEntry.portfoliosBalance).toBe(300);
      // Net worth unchanged — moving cash into a portfolio must not make it vanish.
      expect(todayEntry.totalBalance).toBe(1000);
    });

    it('credits sell proceeds to portfoliosBalance on/after the sell day', async () => {
      // Pins `calculateCashDelta(sell)` -> positive settlement amount funneled
      // into the per-currency cash bucket. AED security so settlement is AED
      // and `getExchangeRate` short-circuits to 1 throughout.
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Sell-proceeds portfolio' }),
        raw: true,
      });

      const aedSecurity = await Securities.create({
        symbol: 'EMAAR',
        providerSymbol: 'EMAAR.AE',
        currencyCode: global.BASE_CURRENCY_CODE,
        providerName: SECURITY_PROVIDER.yahoo,
        assetClass: ASSET_CLASS.stocks,
        name: 'Emaar Properties',
      });

      await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: aedSecurity.id } });
      // Drain background syncHistoricalPrices then clear any rows it inserted so
      // every holding-value lookup falls back to costBasis deterministically.
      await new Promise((resolve) => setTimeout(resolve, 200));
      await SecurityPricing.destroy({ where: { securityId: aedSecurity.id } });

      const fundingDay = format(subDays(new Date(), 7), 'yyyy-MM-dd');
      const buyDay = format(subDays(new Date(), 5), 'yyyy-MM-dd');
      const sellDay = format(subDays(new Date(), 2), 'yyyy-MM-dd');

      await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: { type: 'deposit', amount: '1000', currencyCode: global.BASE_CURRENCY_CODE, date: fundingDay },
        raw: true,
      });

      // Buy 5 @ 100 -> settlementAmount 500, cashDelta -500. Holding qty=5, costBasis=500.
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: aedSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          date: buyDay,
          quantity: '5',
          price: '100',
          fees: '0',
        },
        raw: true,
      });

      // Sell 5 @ 120 -> settlementAmount 600, cashDelta +600. Holding qty=0, costBasis=0.
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: aedSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          date: sellDay,
          quantity: '5',
          price: '120',
          fees: '0',
        },
        raw: true,
      });

      const data = (await helpers.getCombinedBalanceHistory({
        from: format(subDays(new Date(), 10), 'yyyy-MM-dd'),
        to: format(new Date(), 'yyyy-MM-dd'),
        raw: true,
      })) as CombinedBalanceHistoryItem[];

      // Between buy and sell: cash 500 + holding costBasis 500 = 1000.
      const beforeSell = data.find((e) => e.date === format(subDays(new Date(), 3), 'yyyy-MM-dd'));
      expect(beforeSell).toBeDefined();
      expect(beforeSell!.portfoliosBalance).toBe(1000);

      // On sell day: cash 500 + 600 = 1100, holding cleared.
      const onSell = data.find((e) => e.date === sellDay);
      expect(onSell).toBeDefined();
      expect(onSell!.portfoliosBalance).toBe(1100);

      // Running balance carries forward.
      const today = data.find((e) => e.date === format(new Date(), 'yyyy-MM-dd'));
      expect(today!.portfoliosBalance).toBe(1100);
    });

    it('extends the auto-range back to the oldest transfer when from is omitted', async () => {
      // Without the `oldestTransfer` candidate in `getCombinedBalanceHistory`'s
      // auto-range resolver, a cash-only portfolio (no investment transactions,
      // no venture deals) would collapse minDate to today and the series would
      // contain a single point. Asserting the series spans back to the deposit
      // day proves the transfer candidate is load-bearing.
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Auto-range cash portfolio' }),
        raw: true,
      });

      const depositDay = format(subDays(new Date(), 10), 'yyyy-MM-dd');
      await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: { type: 'deposit', amount: '500', currencyCode: global.BASE_CURRENCY_CODE, date: depositDay },
        raw: true,
      });

      const data = (await helpers.getCombinedBalanceHistory({ raw: true })) as CombinedBalanceHistoryItem[];

      // Series reaches back to (or before) the deposit day.
      expect(data.length).toBeGreaterThanOrEqual(10);
      expect(data[0]!.date <= depositDay).toBe(true);

      // Cash is tracked from the deposit day forward.
      const onDeposit = data.find((e) => e.date === depositDay);
      expect(onDeposit).toBeDefined();
      expect(onDeposit!.portfoliosBalance).toBe(500);

      const today = data.find((e) => e.date === format(new Date(), 'yyyy-MM-dd'));
      expect(today!.portfoliosBalance).toBe(500);
    });

    it('reflects direct PortfolioBalances writes when no transactions or transfers were issued', async () => {
      // `PUT /investments/portfolios/:id/balance` writes `PortfolioBalances`
      // directly with no `InvestmentTransaction` / `PortfolioTransfers` audit row.
      // Replay must anchor to the stored cash so this channel is not invisible:
      // a pure direct-write of 750 AED has to appear as 750 today, not 0.
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Direct-write portfolio' }),
        raw: true,
      });

      await helpers.updatePortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode: global.BASE_CURRENCY_CODE,
        setAvailableCash: '750',
        setTotalCash: '750',
        raw: true,
      });

      const data = (await helpers.getCombinedBalanceHistory({
        from: format(subDays(new Date(), 5), 'yyyy-MM-dd'),
        to: format(new Date(), 'yyyy-MM-dd'),
        raw: true,
      })) as CombinedBalanceHistoryItem[];

      const today = data.find((e) => e.date === format(new Date(), 'yyyy-MM-dd'));
      expect(today).toBeDefined();
      expect(today!.portfoliosBalance).toBe(750);
    });

    it('combines direct PortfolioBalances writes with transaction-driven deltas without double-counting', async () => {
      // Reproduces the production bug: user funds IBKR via a direct balance
      // write (e.g. importer / manual seed), then buys securities. The buy
      // debits cash through `calculateCashDelta` while the stored cash row
      // already reflects the post-buy state. Replay must end at the stored
      // 200 today (seed 1000 + buy -800), not at -800.
      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Direct-write + buy portfolio' }),
        raw: true,
      });

      const aedSecurity = await Securities.create({
        symbol: 'ALDAR',
        providerSymbol: 'ALDAR.AE',
        currencyCode: global.BASE_CURRENCY_CODE,
        providerName: SECURITY_PROVIDER.yahoo,
        assetClass: ASSET_CLASS.stocks,
        name: 'Aldar Properties',
      });

      await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: aedSecurity.id } });
      await new Promise((resolve) => setTimeout(resolve, 200));
      await SecurityPricing.destroy({ where: { securityId: aedSecurity.id } });

      // Seed cash directly (simulates importer / manual adjustment) to 1000.
      await helpers.updatePortfolioBalance({
        portfolioId: portfolio.id,
        currencyCode: global.BASE_CURRENCY_CODE,
        setAvailableCash: '1000',
        setTotalCash: '1000',
        raw: true,
      });

      // Buy 8 @ 100 -> cash debit 800. updatePortfolioBalance is called by the
      // transaction service, leaving stored cash at 200 today.
      const buyDay = format(subDays(new Date(), 2), 'yyyy-MM-dd');
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: aedSecurity.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          date: buyDay,
          quantity: '8',
          price: '100',
          fees: '0',
        },
        raw: true,
      });

      const data = (await helpers.getCombinedBalanceHistory({
        from: format(subDays(new Date(), 5), 'yyyy-MM-dd'),
        to: format(new Date(), 'yyyy-MM-dd'),
        raw: true,
      })) as CombinedBalanceHistoryItem[];

      // Today: 200 stored cash + 800 cost-basis fallback for the holding = 1000.
      const today = data.find((e) => e.date === format(new Date(), 'yyyy-MM-dd'));
      expect(today).toBeDefined();
      expect(today!.portfoliosBalance).toBe(1000);
    });
  });
});
