import {
  ACCOUNT_CATEGORIES,
  ASSET_CLASS,
  DEPRECIATION_PRESET,
  INVESTMENT_TRANSACTION_CATEGORY,
  type RecordId,
  SECURITY_PROVIDER,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  VEHICLE_CLASS,
  type endpointsTypes,
} from '@bt/shared/types';
import { until } from '@common/helpers';
import { describe, expect, it } from '@jest/globals';
import Balances from '@models/balances.model';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import * as helpers from '@tests/helpers';
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';

const formatDay = (date: Date) => format(date, 'yyyy-MM-dd');

/**
 * Security priced in the user's base currency, so `getExchangeRate` short-circuits
 * to 1 and the portfolio-value test below asserts the report's math rather than an
 * FX cross-rate. Mirrors the equivalent fixture in get-net-worth-drivers.e2e.ts.
 */
const createBaseCurrencySecurity = async () =>
  Securities.create({
    symbol: 'EMAAR',
    providerSymbol: 'EMAAR',
    currencyCode: global.BASE_CURRENCY.code,
    providerName: SECURITY_PROVIDER.fmp,
    assetClass: ASSET_CLASS.stocks,
    name: 'Emaar Properties',
  });

/**
 * `createHolding` kicks off an un-awaited historical price sync. The sync commits
 * every row it fetches together with the security's `pricingLastSyncedAt` marker
 * in one transaction, so a non-null marker means those rows are already visible
 * and safe to wipe; under the test data-provider mocks the fetch yields nothing
 * and the marker stays null, so a row count that stops moving is the fallback
 * signal that the sync has finished. Wait for whichever settles first before
 * wiping — a fixed sleep would let a slow sync insert after the destroy, leaking
 * a row that then shifts the price assertion below and reads as a math bug.
 */
const seedHolding = async ({ portfolioId, securityId }: { portfolioId: string; securityId: string }) => {
  await helpers.createHolding({ payload: { portfolioId, securityId } });

  let lastCount = -1;
  let stableReads = 0;
  await until(
    async () => {
      const [security, count] = await Promise.all([
        Securities.findByPk(securityId, { attributes: ['pricingLastSyncedAt'] }),
        SecurityPricing.count({ where: { securityId } }),
      ]);
      if (security?.pricingLastSyncedAt) return true;
      if (count === lastCount) {
        stableReads += 1;
      } else {
        stableReads = 0;
        lastCount = count;
      }
      // Three consecutive equal reads: the sync has stopped inserting for this security.
      return stableReads >= 2;
    },
    { timeout: 5000, interval: 50 },
  );

  await SecurityPricing.destroy({ where: { securityId } });
};

const setPrice = async ({ securityId, date, price }: { securityId: string; date: string; price: string }) =>
  SecurityPricing.create({
    securityId,
    date: new Date(`${date}T00:00:00.000Z`),
    priceClose: price,
    source: SECURITY_PROVIDER.fmp,
  });

describe('[Stats] Net worth history', () => {
  describe('GET /stats/net-worth-history', () => {
    it('returns per-kind liabilities, assets and net worth with carry-forward across monthly buckets', async () => {
      const monthTwoAgoStart = startOfMonth(subMonths(new Date(), 2));
      const monthOneAgoStart = startOfMonth(subMonths(new Date(), 1));
      const from = formatDay(monthTwoAgoStart);
      const to = formatDay(new Date());

      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
        raw: true,
      });
      // Move the creation-day balance row to the range start so the first month
      // reads the opening 1000 and later months carry balances forward from it.
      await Balances.update({ date: monthTwoAgoStart }, { where: { accountId: account.id } });

      // Income at the start of last month: month-2 still reads 1000, month-1
      // onward reads 1500.
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.income,
          time: monthOneAgoStart.toISOString(),
        }),
        raw: true,
      });

      const creditCard = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          accountCategory: ACCOUNT_CATEGORIES.creditCard,
          initialBalance: 0,
        }),
        raw: true,
      });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: creditCard.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      // Loan currency must match the base currency so ref amounts stay 1:1.
      await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          currencyCode: global.BASE_CURRENCY.code,
          initialBalance: 200_000,
        }),
        raw: true,
      });

      const result = await helpers.getNetWorthHistory({ from, to, granularity: 'monthly', raw: true });

      expect(result.points).toHaveLength(3);
      expect(result.points.map((point) => point.date)).toEqual([
        formatDay(endOfMonth(monthTwoAgoStart)),
        formatDay(endOfMonth(monthOneAgoStart)),
        to,
      ]);

      const [monthTwoAgo, monthOneAgo, current] = result.points;

      expect(monthTwoAgo!.assetsTotal).toBe(1000);
      expect(monthTwoAgo!.assets.cash).toBe(1000);
      expect(monthTwoAgo!.liabilities[ACCOUNT_CATEGORIES.creditCard]).toBe(-500);
      expect(monthTwoAgo!.liabilities[ACCOUNT_CATEGORIES.loan]).toBe(-200_000);
      expect(monthTwoAgo!.liabilities[ACCOUNT_CATEGORIES.overdraft]).toBe(0);
      expect(monthTwoAgo!.liabilitiesTotal).toBe(-200_500);
      expect(monthTwoAgo!.netWorth).toBe(-199_500);

      // A month with no transactions still shows the carried balances.
      expect(monthOneAgo!.assetsTotal).toBe(1500);
      expect(monthOneAgo!.assets.cash).toBe(1500);
      expect(monthOneAgo!.liabilities[ACCOUNT_CATEGORIES.creditCard]).toBe(-500);
      expect(monthOneAgo!.liabilities[ACCOUNT_CATEGORIES.loan]).toBe(-200_000);
      expect(monthOneAgo!.liabilitiesTotal).toBe(-200_500);
      expect(monthOneAgo!.netWorth).toBe(-199_000);

      expect(current!.assetsTotal).toBe(1500);
      expect(current!.assets.cash).toBe(1500);
      expect(current!.liabilities[ACCOUNT_CATEGORIES.creditCard]).toBe(-500);
      expect(current!.liabilities[ACCOUNT_CATEGORIES.loan]).toBe(-200_000);
      expect(current!.liabilities[ACCOUNT_CATEGORIES.overdraft]).toBe(0);
      expect(current!.liabilitiesTotal).toBe(-200_500);
      expect(current!.netWorth).toBe(-199_000);
    });

    it('returns all-zero points for the whole range when the user has no data', async () => {
      const from = formatDay(startOfMonth(subMonths(new Date(), 2)));
      const to = formatDay(new Date());

      const result = await helpers.getNetWorthHistory({ from, to, granularity: 'monthly', raw: true });

      expect(result.points).toHaveLength(3);
      for (const point of result.points) {
        expect(point.assetsTotal).toBe(0);
        expect(point.assets.cash).toBe(0);
        expect(point.assets.investments).toBe(0);
        expect(point.assets.vehicles).toBe(0);
        expect(point.assets.ventures).toBe(0);
        expect(point.liabilities[ACCOUNT_CATEGORIES.creditCard]).toBe(0);
        expect(point.liabilities[ACCOUNT_CATEGORIES.loan]).toBe(0);
        expect(point.liabilities[ACCOUNT_CATEGORIES.overdraft]).toBe(0);
        expect(point.liabilitiesTotal).toBe(0);
        expect(point.netWorth).toBe(0);
      }
    });

    it('rejects `from` after `to` with 422', async () => {
      const res = await helpers.getNetWorthHistory({
        from: '2024-02-01',
        to: '2024-01-01',
        granularity: 'monthly',
      });

      expect(res.statusCode).toBe(422);
    });

    it('rejects an unknown granularity with 422', async () => {
      const res = await helpers.getNetWorthHistory({
        from: '2024-01-01',
        to: '2024-03-01',
        granularity: 'hourly' as endpointsTypes.NetWorthHistoryGranularity,
      });

      expect(res.statusCode).toBe(422);
    });

    it('rejects a range producing more than 500 buckets with 422', async () => {
      // ~730 weekly buckets over 14 years — past the 500 cap.
      const res = await helpers.getNetWorthHistory({
        from: '2010-01-01',
        to: '2024-01-01',
        granularity: 'weekly',
      });

      expect(res.statusCode).toBe(422);
    });

    it('excludes excludeFromStats credit-card accounts from liabilities', async () => {
      const from = formatDay(startOfMonth(new Date()));
      const to = formatDay(new Date());

      await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
        raw: true,
      });

      const creditCard = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          accountCategory: ACCOUNT_CATEGORIES.creditCard,
          initialBalance: 0,
        }),
        raw: true,
      });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: creditCard.id,
          amount: 300,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      await helpers.updateAccount({
        id: creditCard.id,
        payload: { excludeFromStats: true },
        raw: true,
      });

      const result = await helpers.getNetWorthHistory({ from, to, granularity: 'monthly', raw: true });

      expect(result.points).toHaveLength(1);
      const point = result.points[0]!;
      expect(point.assetsTotal).toBe(1000);
      expect(point.assets.cash).toBe(1000);
      expect(point.liabilities[ACCOUNT_CATEGORIES.creditCard]).toBe(0);
      expect(point.liabilitiesTotal).toBe(0);
      expect(point.netWorth).toBe(1000);
    });

    it('counts a positive-balance credit card as an asset, not a liability', async () => {
      const from = formatDay(startOfMonth(new Date()));
      const to = formatDay(new Date());

      await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
        raw: true,
      });

      const creditCard = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          accountCategory: ACCOUNT_CATEGORIES.creditCard,
          initialBalance: 0,
        }),
        raw: true,
      });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: creditCard.id,
          amount: 200,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });

      const result = await helpers.getNetWorthHistory({ from, to, granularity: 'monthly', raw: true });

      expect(result.points).toHaveLength(1);
      const point = result.points[0]!;
      // Sign rule: the card holds own funds, so it moves to assets and the
      // liability kind reads 0; netWorth stays assets + liabilitiesTotal. The
      // card's positive balance folds into the `cash` kind alongside the account.
      expect(point.assetsTotal).toBe(1200);
      expect(point.assets.cash).toBe(1200);
      expect(point.liabilities[ACCOUNT_CATEGORIES.creditCard]).toBe(0);
      expect(point.liabilitiesTotal).toBe(0);
      expect(point.netWorth).toBe(1200);
    });

    it('splits mixed credit cards per account: owing card stays a liability, positive card counts as an asset', async () => {
      const from = formatDay(startOfMonth(new Date()));
      const to = formatDay(new Date());

      await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
        raw: true,
      });

      const owingCard = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          accountCategory: ACCOUNT_CATEGORIES.creditCard,
          initialBalance: 0,
        }),
        raw: true,
      });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: owingCard.id,
          amount: 500,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const positiveCard = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          accountCategory: ACCOUNT_CATEGORIES.creditCard,
          initialBalance: 0,
        }),
        raw: true,
      });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: positiveCard.id,
          amount: 300,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });

      const result = await helpers.getNetWorthHistory({ from, to, granularity: 'monthly', raw: true });

      expect(result.points).toHaveLength(1);
      const point = result.points[0]!;
      expect(point.assetsTotal).toBe(1300);
      expect(point.assets.cash).toBe(1300);
      expect(point.liabilities[ACCOUNT_CATEGORIES.creditCard]).toBe(-500);
      expect(point.liabilitiesTotal).toBe(-500);
      expect(point.netWorth).toBe(800);
    });

    it('includes a priced portfolio holding in assets, not silently zero', async () => {
      // Fixed past window: December 2025 is already fully elapsed, so the single
      // bucket is never the in-progress "current" one and the price is deterministic.
      const from = '2025-12-01';
      const to = '2025-12-31';

      const portfolio = await helpers.createPortfolio({ raw: true });
      const security = await createBaseCurrencySecurity();
      await seedHolding({ portfolioId: portfolio.id, securityId: security.id });

      await helpers.directCashTransaction({
        portfolioId: portfolio.id,
        payload: { type: 'deposit', amount: '1000', currencyCode: global.BASE_CURRENCY.code, date: '2025-11-15' },
        raw: true,
      });
      await helpers.createInvestmentTransaction({
        payload: {
          portfolioId: portfolio.id,
          securityId: security.id,
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          date: '2025-11-20',
          quantity: '10',
          price: '100',
          fees: '0',
        },
        raw: true,
      });
      // The 1000 deposit exactly funds the buy, leaving no uninvested cash, so the
      // whole point value is the 10-share holding priced at the bucket-end close.
      await setPrice({ securityId: security.id, date: to, price: '150' });

      const result = await helpers.getNetWorthHistory({ from, to, granularity: 'monthly', raw: true });

      expect(result.points).toHaveLength(1);
      const point = result.points[0]!;
      // This path had zero coverage before — the holding must land in the
      // `investments` asset kind (and net worth), not silently read as 0 or leak
      // into the cash bucket.
      expect(point.assetsTotal).toBe(1500);
      expect(point.assets.investments).toBe(1500);
      expect(point.assets.cash).toBe(0);
      expect(point.netWorth).toBe(1500);
    });

    it('classifies an owing overdraft account as a liability', async () => {
      const from = formatDay(startOfMonth(new Date()));
      const to = formatDay(new Date());

      const overdraftAccount = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          accountCategory: ACCOUNT_CATEGORIES.overdraft,
          initialBalance: 0,
        }),
        raw: true,
      });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: overdraftAccount.id,
          amount: 400,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const result = await helpers.getNetWorthHistory({ from, to, granularity: 'monthly', raw: true });

      expect(result.points).toHaveLength(1);
      const point = result.points[0]!;
      // Existing coverage only ever asserts overdraft == 0 from absence — this
      // proves the owing (negative) branch actually flows into liabilities.
      expect(point.liabilities[ACCOUNT_CATEGORIES.overdraft]).toBe(-400);
      expect(point.liabilitiesTotal).toBe(-400);
      expect(point.netWorth).toBe(-400);
      expect(point.assetsTotal).toBe(0);
    });

    it('classifies an overdrawn deposit account as an overdraft liability, keeping cash non-negative', async () => {
      const from = formatDay(startOfMonth(new Date()));
      const to = formatDay(new Date());

      // A plain deposit account holding the user's own funds.
      const positiveAccount = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 1000 }),
        raw: true,
      });

      // A second deposit account overdrawn into the negative by an expense.
      const overdrawnAccount = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 0 }),
        raw: true,
      });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: overdrawnAccount.id,
          amount: 300,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const result = await helpers.getNetWorthHistory({ from, to, granularity: 'monthly', raw: true });

      expect(result.points).toHaveLength(1);
      const point = result.points[0]!;
      // Per-account sign split: the positive account's own funds stay in `cash`, the
      // overdrawn account's owed balance moves to the overdraft liability kind rather
      // than dragging cash negative. Net worth is the same either way.
      expect(point.assets.cash).toBe(1000);
      expect(point.assetsTotal).toBe(1000);
      expect(point.liabilities[ACCOUNT_CATEGORIES.overdraft]).toBe(-300);
      expect(point.liabilities[ACCOUNT_CATEGORIES.creditCard]).toBe(0);
      expect(point.liabilitiesTotal).toBe(-300);
      expect(point.netWorth).toBe(700);
    });

    it('folds an overdrawn deposit account and an owing overdraft account into one overdraft total', async () => {
      const from = formatDay(startOfMonth(new Date()));
      const to = formatDay(new Date());

      const overdrawnDeposit = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance: 0 }),
        raw: true,
      });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: overdrawnDeposit.id,
          amount: 150,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const overdraftAccount = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          accountCategory: ACCOUNT_CATEGORIES.overdraft,
          initialBalance: 0,
        }),
        raw: true,
      });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: overdraftAccount.id,
          amount: 250,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const result = await helpers.getNetWorthHistory({ from, to, granularity: 'monthly', raw: true });

      expect(result.points).toHaveLength(1);
      const point = result.points[0]!;
      // Both owed balances share the overdraft kind — there is no separate bucket
      // for an overdrawn plain account.
      expect(point.liabilities[ACCOUNT_CATEGORIES.overdraft]).toBe(-400);
      expect(point.assets.cash).toBe(0);
      expect(point.netWorth).toBe(-400);
    });

    it('backfills a loan payoff dated on the anchor day without rewriting earlier buckets', async () => {
      const monthTwoAgoStart = startOfMonth(subMonths(new Date(), 2));
      const from = formatDay(monthTwoAgoStart);
      const to = formatDay(new Date());

      // Loan currency must match the base currency so ref amounts stay 1:1.
      const loan = await helpers.createLoan({
        payload: helpers.buildCreateLoanPayload({
          currencyCode: global.BASE_CURRENCY.code,
          initialBalance: 200_000,
          originalPrincipal: 200_000,
        }),
        raw: true,
      });

      const sourceAccount = await helpers.createAccount({ raw: true });

      // A loan's balance anchor defaults to its creation day (today) — the same
      // day as the range's last bucket. Paying it off in full on that day must
      // fold the anchor row toward zero without rewriting earlier buckets, which
      // back-fill from the loan's immutable opening balance instead.
      await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: sourceAccount.id,
            amount: 200_000,
            time: `${to}T12:00:00.000Z`,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 200_000,
          destinationAccountId: loan.id as RecordId,
        },
        raw: true,
      });

      const result = await helpers.getNetWorthHistory({ from, to, granularity: 'monthly', raw: true });

      expect(result.points).toHaveLength(3);
      const [monthTwoAgo, monthOneAgo, current] = result.points;

      // Earlier buckets still read the loan's opening balance, untouched by the payoff.
      expect(monthTwoAgo!.liabilities[ACCOUNT_CATEGORIES.loan]).toBe(-200_000);
      expect(monthOneAgo!.liabilities[ACCOUNT_CATEGORIES.loan]).toBe(-200_000);
      // Only the anchor-day (last) bucket folds the payoff in.
      expect(current!.liabilities[ACCOUNT_CATEGORIES.loan]).toBe(0);
    });

    it('includes a vehicle at its purchase-anchored value in assets', async () => {
      const from = formatDay(startOfMonth(new Date()));
      const to = formatDay(new Date());

      await helpers.createVehicle({
        name: 'Test car',
        currencyCode: global.BASE_CURRENCY.code,
        make: 'Toyota',
        model: 'Corolla',
        year: 2020,
        vehicleClass: VEHICLE_CLASS.sedan,
        purchasePrice: 25_000,
        purchaseDate: '2020-01-01',
        // A flat 0% custom rate keeps the vehicle at its purchase price for the
        // life of the fixture, so the asserted value is exact rather than riding
        // a depreciation curve.
        depreciationPreset: DEPRECIATION_PRESET.custom,
        customAnnualRatePct: 0,
        raw: true,
      });

      const result = await helpers.getNetWorthHistory({ from, to, granularity: 'monthly', raw: true });

      expect(result.points).toHaveLength(1);
      const point = result.points[0]!;
      expect(point.assetsTotal).toBe(25_000);
      expect(point.assets.vehicles).toBe(25_000);
      expect(point.assets.cash).toBe(0);
      expect(point.netWorth).toBe(25_000);
    });
  });
});
