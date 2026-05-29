import { ASSET_CLASS, INVESTMENT_TRANSACTION_CATEGORY, SECURITY_PROVIDER, TRANSACTION_TYPES } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import Balances from '@models/balances.model';
import ExchangeRates from '@models/exchange-rates.model';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import UserExchangeRates from '@models/user-exchange-rates.model';
import { API_LAYER_BASE_CURRENCY_CODE } from '@services/exchange-rates/fetch-exchange-rates-for-date';
import * as helpers from '@tests/helpers';
import { format, subDays } from 'date-fns';
import { Op } from 'sequelize';

import { CombinedBalanceHistoryItem } from './get-combined-balance-history';

describe('[Stats] Combined balance history', () => {
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
    expect(record).toHaveProperty('totalBalance');
    expect(record.totalBalance).toBe(record.accountsBalance + record.portfoliosBalance + record.venturesBalance);
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
    // ExchangeRates is preserved across test truncation as seed data (see
    // `SEED_DATA_TABLES` in `setupIntegrationTests.ts`). Tests in this block
    // need precise control over which rates exist when the history endpoint
    // runs, so the cleanup happens BOTH before each test (to clear any prior
    // describe's leak) and inside `seedHoldingAndPriceHistory` AFTER the
    // investment-transaction insert (because `calculateRefAmount` lazily
    // fetches rates and stores them — without that second wipe, every test
    // would observe an unexpected USD→AED row).
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

    const seedHoldingAndPriceHistory = async ({
      portfolioId,
      securityId,
      pickedDay,
      dayKey,
      price = '100',
    }: {
      portfolioId: string;
      securityId: string;
      pickedDay: Date;
      dayKey: string;
      price?: string;
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

      // The transaction-create flow calls `calculateRefAmount`, which lazily
      // hits the live FX provider and writes a row to `ExchangeRates`. Wipe
      // that row so each test asserts only against the rates it explicitly
      // seeds in the lines that follow.
      await wipeFxState();
    };

    beforeEach(wipeFxState);

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

    it('computes the correct cross-rate when neither security nor user base is USD', async () => {
      // Security in EUR, user base AED. USD→EUR = 2, USD→AED = 4 -> EUR→AED = 2.
      // 1 share * €100 * 2 AED/EUR = 200 AED.
      const pickedDay = subDays(new Date(), 3);
      pickedDay.setUTCHours(0, 0, 0, 0);
      const dayKey = format(pickedDay, 'yyyy-MM-dd');

      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'EUR Stocks' }),
        raw: true,
      });

      const eurSecurity = await Securities.create({
        symbol: 'ASML',
        providerSymbol: 'ASML.AS',
        currencyCode: 'EUR',
        providerName: SECURITY_PROVIDER.yahoo,
        assetClass: ASSET_CLASS.stocks,
        name: 'ASML Holding',
      });

      await seedHoldingAndPriceHistory({
        portfolioId: portfolio.id,
        securityId: eurSecurity.id,
        pickedDay,
        dayKey,
      });

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
      expect(entry!.portfoliosBalance).toBe(200);
    });

    it('walks back to a prior-date rate when no rate exists for the requested day', async () => {
      // Seed USD→AED only at day-5; query on pickedDay (day-2). `findLatestUsdRate`
      // must walk back to the prior rate rather than fall through to 1:1.
      const pickedDay = subDays(new Date(), 2);
      pickedDay.setUTCHours(0, 0, 0, 0);
      const rateSeedDay = subDays(pickedDay, 3);
      rateSeedDay.setUTCHours(0, 0, 0, 0);
      const dayKey = format(pickedDay, 'yyyy-MM-dd');

      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'Walk-back portfolio' }),
        raw: true,
      });

      const usdSecurity = await Securities.create({
        symbol: 'MSFT',
        providerSymbol: 'MSFT',
        currencyCode: 'USD',
        providerName: SECURITY_PROVIDER.yahoo,
        assetClass: ASSET_CLASS.stocks,
        name: 'Microsoft',
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
        date: rateSeedDay,
      });

      const data = (await helpers.getCombinedBalanceHistory({
        from: format(subDays(pickedDay, 1), 'yyyy-MM-dd'),
        to: format(new Date(), 'yyyy-MM-dd'),
        raw: true,
      })) as CombinedBalanceHistoryItem[];

      const entry = data.find((e) => e.date === dayKey);
      expect(entry).toBeDefined();
      // Walk-back must use the seeded rate, not the 1:1 fallback.
      expect(entry!.portfoliosBalance).toBe(400);
    });

    it('prefers a UserExchangeRates override over the canonical USD-pivot rate', async () => {
      // System rate USD→AED = 4. User override (UserExchangeRates baseCode=USD,
      // quoteCode=AED) = 10. Override must win.
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

    it('falls back to 1:1 (security-currency value) when no rate of any kind exists', async () => {
      // No ExchangeRates / UserExchangeRates seeded. The endpoint must not
      // crash — it returns the security-currency value as-is (1:1) and the
      // dispatcher emits a single trailing warn. This pins the documented
      // graceful-degradation contract.
      const pickedDay = subDays(new Date(), 3);
      pickedDay.setUTCHours(0, 0, 0, 0);
      const dayKey = format(pickedDay, 'yyyy-MM-dd');

      const portfolio = await helpers.createPortfolio({
        payload: helpers.buildPortfolioPayload({ name: 'No-rate portfolio' }),
        raw: true,
      });

      const usdSecurity = await Securities.create({
        symbol: 'AMZN',
        providerSymbol: 'AMZN',
        currencyCode: 'USD',
        providerName: SECURITY_PROVIDER.yahoo,
        assetClass: ASSET_CLASS.stocks,
        name: 'Amazon',
      });

      await seedHoldingAndPriceHistory({
        portfolioId: portfolio.id,
        securityId: usdSecurity.id,
        pickedDay,
        dayKey,
      });

      const data = (await helpers.getCombinedBalanceHistory({
        from: format(subDays(pickedDay, 1), 'yyyy-MM-dd'),
        to: format(new Date(), 'yyyy-MM-dd'),
        raw: true,
      })) as CombinedBalanceHistoryItem[];

      const entry = data.find((e) => e.date === dayKey);
      expect(entry).toBeDefined();
      // Rate falls back to 1 -> 1 * 100 * 1 = 100 in user-base units.
      expect(entry!.portfoliosBalance).toBe(100);
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
});
