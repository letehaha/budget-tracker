import { ASSET_CLASS, INVESTMENT_TRANSACTION_CATEGORY, SECURITY_PROVIDER, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import Balances from '@models/balances.model';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import * as helpers from '@tests/helpers';
import { format, subDays } from 'date-fns';

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
    expect(record).toHaveProperty('totalBalance');
    expect(record.totalBalance).toBe(record.accountsBalance + record.portfoliosBalance);
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
});
