import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { describe, expect, it } from '@jest/globals';

import { accumulateCashDeltas, computePortfolioCashByDate } from './portfolio-cash-replay';
import type { CurrentBalanceRow, TransactionRow, TransferRow } from './types';

const tx = ({
  portfolioId = 'p1',
  category,
  date,
  settlementAmount,
  settlementCurrencyCode = 'USD',
}: {
  portfolioId?: string;
  category: INVESTMENT_TRANSACTION_CATEGORY;
  date: string;
  settlementAmount: number;
  settlementCurrencyCode?: string;
}): TransactionRow =>
  ({
    portfolioId,
    securityId: 'sec-1',
    category,
    date: new Date(`${date}T00:00:00Z`),
    quantity: Money.fromDecimal(1),
    refAmount: Money.fromDecimal(settlementAmount),
    refFees: Money.fromDecimal(0),
    currencyCode: settlementCurrencyCode,
    settlementAmount: Money.fromDecimal(settlementAmount),
    settlementCurrencyCode,
  }) as unknown as TransactionRow;

const transfer = ({
  fromPortfolioId = null,
  toPortfolioId = null,
  amount,
  currencyCode = 'USD',
  toCurrencyCode = null,
  toAmount = null,
  date,
}: {
  fromPortfolioId?: string | null;
  toPortfolioId?: string | null;
  amount: number;
  currencyCode?: string;
  toCurrencyCode?: string | null;
  toAmount?: number | null;
  date: string;
}): TransferRow =>
  ({
    fromPortfolioId,
    toPortfolioId,
    amount: Money.fromDecimal(amount),
    currencyCode,
    toCurrencyCode,
    toAmount: toAmount === null ? null : Money.fromDecimal(toAmount),
    date,
  }) as unknown as TransferRow;

const balanceRow = ({
  portfolioId = 'p1',
  currencyCode,
  totalCash,
  refTotalCash = totalCash,
}: {
  portfolioId?: string;
  currencyCode: string;
  totalCash: number;
  refTotalCash?: number;
}): CurrentBalanceRow =>
  ({
    portfolioId,
    currencyCode,
    totalCash: Money.fromDecimal(totalCash),
    refTotalCash: Money.fromDecimal(refTotalCash),
  }) as unknown as CurrentBalanceRow;

describe('accumulateCashDeltas', () => {
  it('returns an empty map when nothing flows', () => {
    const result = accumulateCashDeltas({
      transactions: [],
      portfolioTransfers: [],
      portfolioIdSet: new Set(['p1']),
    });
    expect(result.size).toBe(0);
  });

  it('applies a negative delta in the settlement currency for a buy', () => {
    const result = accumulateCashDeltas({
      transactions: [
        tx({
          category: INVESTMENT_TRANSACTION_CATEGORY.buy,
          date: '2024-05-10',
          settlementAmount: 100,
          settlementCurrencyCode: 'USD',
        }),
      ],
      portfolioTransfers: [],
      portfolioIdSet: new Set(['p1']),
    });
    expect(result.get('USD')?.get('2024-05-10')).toBe(-100);
  });

  it('applies a positive delta for sell and dividend categories', () => {
    const result = accumulateCashDeltas({
      transactions: [
        tx({ category: INVESTMENT_TRANSACTION_CATEGORY.sell, date: '2024-05-10', settlementAmount: 600 }),
        tx({ category: INVESTMENT_TRANSACTION_CATEGORY.dividend, date: '2024-05-11', settlementAmount: 50 }),
      ],
      portfolioTransfers: [],
      portfolioIdSet: new Set(['p1']),
    });
    expect(result.get('USD')?.get('2024-05-10')).toBe(600);
    expect(result.get('USD')?.get('2024-05-11')).toBe(50);
  });

  it('skips categories with no cash impact (transfer/cancel/other)', () => {
    const result = accumulateCashDeltas({
      transactions: [
        tx({ category: INVESTMENT_TRANSACTION_CATEGORY.transfer, date: '2024-05-10', settlementAmount: 100 }),
        tx({ category: INVESTMENT_TRANSACTION_CATEGORY.cancel, date: '2024-05-10', settlementAmount: 100 }),
        tx({ category: INVESTMENT_TRANSACTION_CATEGORY.other, date: '2024-05-10', settlementAmount: 100 }),
      ],
      portfolioTransfers: [],
      portfolioIdSet: new Set(['p1']),
    });
    expect(result.size).toBe(0);
  });

  it('sums same-day deltas instead of overwriting (no last-write-wins on cash flow)', () => {
    const result = accumulateCashDeltas({
      transactions: [],
      portfolioTransfers: [
        transfer({ toPortfolioId: 'p1', amount: 200, currencyCode: 'USD', date: '2024-05-10' }),
        transfer({ toPortfolioId: 'p1', amount: 300, currencyCode: 'USD', date: '2024-05-10' }),
      ],
      portfolioIdSet: new Set(['p1']),
    });
    expect(result.get('USD')?.get('2024-05-10')).toBe(500);
  });

  it('skips zero deltas instead of inserting a no-op map entry', () => {
    const result = accumulateCashDeltas({
      transactions: [tx({ category: INVESTMENT_TRANSACTION_CATEGORY.buy, date: '2024-05-10', settlementAmount: 0 })],
      portfolioTransfers: [],
      portfolioIdSet: new Set(['p1']),
    });
    expect(result.size).toBe(0);
  });

  it('credits in-flow and debits out-flow for portfolio-to-portfolio transfers in the same currency', () => {
    const result = accumulateCashDeltas({
      transactions: [],
      portfolioTransfers: [
        transfer({
          fromPortfolioId: 'p1',
          toPortfolioId: 'p2',
          amount: 250,
          currencyCode: 'USD',
          date: '2024-05-10',
        }),
      ],
      portfolioIdSet: new Set(['p1', 'p2']),
    });
    expect(result.get('USD')?.get('2024-05-10')).toBe(0);
    // The zero-skip in `addCashDelta` applies to each incoming delta, not the
    // accumulated sum — two non-zero legs netting to 0 still leave a 0 entry.
    // Confirm each leg individually via a single-portfolio set.
    const onlyP1 = accumulateCashDeltas({
      transactions: [],
      portfolioTransfers: [
        transfer({
          fromPortfolioId: 'p1',
          toPortfolioId: 'p2',
          amount: 250,
          currencyCode: 'USD',
          date: '2024-05-10',
        }),
      ],
      portfolioIdSet: new Set(['p1']),
    });
    expect(onlyP1.get('USD')?.get('2024-05-10')).toBe(-250);
  });

  it('applies the destination leg of a cross-currency in-portfolio FX to `toCurrencyCode` / `toAmount`', () => {
    const result = accumulateCashDeltas({
      transactions: [],
      portfolioTransfers: [
        transfer({
          fromPortfolioId: 'p1',
          toPortfolioId: 'p1',
          amount: 500,
          currencyCode: 'EUR',
          toCurrencyCode: 'AED',
          toAmount: 540,
          date: '2024-05-10',
        }),
      ],
      portfolioIdSet: new Set(['p1']),
    });
    expect(result.get('EUR')?.get('2024-05-10')).toBe(-500);
    expect(result.get('AED')?.get('2024-05-10')).toBe(540);
  });

  it('applies the source-leg debit and skips the destination credit when a cross-currency transfer is missing its toAmount', () => {
    // Malformed row must degrade gracefully (source leg is trustworthy on its
    // own), not throw — a throw would 500 the whole combined-history endpoint.
    const result = accumulateCashDeltas({
      transactions: [],
      portfolioTransfers: [
        transfer({
          fromPortfolioId: 'p1',
          toPortfolioId: 'p1',
          amount: 500,
          currencyCode: 'EUR',
          toCurrencyCode: 'AED',
          toAmount: null,
          date: '2024-05-10',
        }),
      ],
      portfolioIdSet: new Set(['p1']),
    });
    expect(result.get('EUR')?.get('2024-05-10')).toBe(-500);
    expect(result.has('AED')).toBe(false);
  });

  it('applies the source-leg debit and skips the destination credit when a cross-currency transfer carries a zero toAmount', () => {
    const result = accumulateCashDeltas({
      transactions: [],
      portfolioTransfers: [
        transfer({
          fromPortfolioId: 'p1',
          toPortfolioId: 'p1',
          amount: 500,
          currencyCode: 'EUR',
          toCurrencyCode: 'AED',
          toAmount: 0,
          date: '2024-05-10',
        }),
      ],
      portfolioIdSet: new Set(['p1']),
    });
    expect(result.get('EUR')?.get('2024-05-10')).toBe(-500);
    expect(result.has('AED')).toBe(false);
  });

  it('ignores transfers whose portfolio legs are not in the portfolioIdSet', () => {
    const result = accumulateCashDeltas({
      transactions: [],
      portfolioTransfers: [
        transfer({ fromPortfolioId: 'other', amount: 100, currencyCode: 'USD', date: '2024-05-10' }),
        transfer({ toPortfolioId: 'other', amount: 100, currencyCode: 'USD', date: '2024-05-10' }),
      ],
      portfolioIdSet: new Set(['p1']),
    });
    expect(result.size).toBe(0);
  });
});

describe('computePortfolioCashByDate', () => {
  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const identityRate = () => 1;

  it('returns an empty map when uniqueDates is empty', () => {
    expect(
      computePortfolioCashByDate({
        cashDeltaByCurrencyDay: new Map(),
        currentBalances: [],
        uniqueDates: [],
        maxDate: '2024-05-10',
        getExchangeRate: identityRate,
      }).size,
    ).toBe(0);
  });

  it('direct-write anchor: stored cash without any deltas reads flat for every day', () => {
    // A `PortfolioBalances` row written directly (data migration / importer
    // that skipped the API) has no matching tx/transfer audit row. With zero
    // deltas, seed = stored - 0 = stored, so every in-window day reads `stored`.
    const result = computePortfolioCashByDate({
      cashDeltaByCurrencyDay: new Map(),
      currentBalances: [balanceRow({ currencyCode: 'USD', totalCash: 500 })],
      uniqueDates: ['2024-05-10', '2024-05-11', '2024-05-12'],
      maxDate: '2024-05-12',
      getExchangeRate: identityRate,
      todayKey: '2025-01-01', // far in the future, so the today-cell overwrite does NOT fire inside the window.
    });
    expect(result.get('2024-05-10')).toBe(500);
    expect(result.get('2024-05-11')).toBe(500);
    expect(result.get('2024-05-12')).toBe(500);
  });

  it('seed = stored - sum(deltas): replay lands the final day on the stored value', () => {
    // Stored 1000; deltas: -800 on 2024-05-11 (mid-window). Seed = 1000 - (-800) = 1800.
    // Day 10: running = 1800 (no delta) → 1800.
    // Day 11: running = 1800 + (-800) = 1000.
    // Override on todayKey 2024-05-12 sets refTotalCash sum = 1000.
    const deltas = new Map<string, Map<string, number>>();
    deltas.set('USD', new Map([['2024-05-11', -800]]));
    const result = computePortfolioCashByDate({
      cashDeltaByCurrencyDay: deltas,
      currentBalances: [balanceRow({ currencyCode: 'USD', totalCash: 1000, refTotalCash: 1000 })],
      uniqueDates: ['2024-05-10', '2024-05-11', '2024-05-12'],
      maxDate: '2024-05-12',
      getExchangeRate: identityRate,
      todayKey: '2024-05-12',
    });
    expect(result.get('2024-05-10')).toBe(1800);
    expect(result.get('2024-05-11')).toBe(1000);
    expect(result.get('2024-05-12')).toBe(1000);
  });

  it('seeds the running balance from pre-window deltas', () => {
    // Stored 500; one deposit BEFORE the window (2024-05-01) +500. Total delta = +500.
    // Seed = 500 - 500 = 0. Pre-window loop accumulates +500 before the window starts.
    // Inside window: running stays at 500 (no in-window deltas).
    const deltas = new Map<string, Map<string, number>>();
    deltas.set('USD', new Map([['2024-05-01', 500]]));
    const result = computePortfolioCashByDate({
      cashDeltaByCurrencyDay: deltas,
      currentBalances: [balanceRow({ currencyCode: 'USD', totalCash: 500, refTotalCash: 500 })],
      uniqueDates: ['2024-05-10', '2024-05-11'],
      maxDate: '2024-05-11',
      getExchangeRate: identityRate,
      todayKey: '2024-05-11',
    });
    expect(result.get('2024-05-10')).toBe(500);
    expect(result.get('2024-05-11')).toBe(500);
  });

  it('overwrites the today cell with the stored refTotalCash sum even when the per-day rate differs', () => {
    // Two stored balances totalling refTotalCash 1000. Deltas + rates would land
    // the running calculation elsewhere; the overwrite pins the today cell to 1000.
    const deltas = new Map<string, Map<string, number>>();
    deltas.set('EUR', new Map([['2024-05-10', 100]]));
    const result = computePortfolioCashByDate({
      cashDeltaByCurrencyDay: deltas,
      currentBalances: [
        balanceRow({ portfolioId: 'p1', currencyCode: 'EUR', totalCash: 100, refTotalCash: 400 }),
        balanceRow({ portfolioId: 'p2', currencyCode: 'AED', totalCash: 600, refTotalCash: 600 }),
      ],
      uniqueDates: ['2024-05-09', '2024-05-10'],
      maxDate: '2024-05-10',
      getExchangeRate: () => 5, // Would otherwise produce 500 on EUR cash.
      todayKey: '2024-05-10',
    });
    // The overwrite pins the today cell to the stored ref sum, regardless of per-day FX.
    expect(result.get('2024-05-10')).toBe(1000);
  });

  it('anchors the overwrite to todayKey (not maxDate) when the window extends into the future', () => {
    // maxDate is in the future, today is earlier. The overwrite must apply on
    // todayKey, NOT on maxDate, so stored cash does not spread into future days.
    // refTotalCash (750) differs from totalCash (500) so the overwritten cell
    // is distinguishable from the replayed ones.
    const result = computePortfolioCashByDate({
      cashDeltaByCurrencyDay: new Map(),
      currentBalances: [balanceRow({ currencyCode: 'USD', totalCash: 500, refTotalCash: 750 })],
      uniqueDates: ['2024-05-10', '2024-05-11', '2024-05-12'],
      maxDate: '2024-05-12',
      getExchangeRate: identityRate,
      todayKey: '2024-05-11',
    });
    expect(result.get('2024-05-10')).toBe(500);
    expect(result.get('2024-05-11')).toBe(750);
    expect(result.get('2024-05-12')).toBe(500);
  });

  it('skips emitting an entry for a day whose running balance is zero', () => {
    // Stored 0, no deltas → seed = 0, running stays 0 → no entry emitted.
    const result = computePortfolioCashByDate({
      cashDeltaByCurrencyDay: new Map(),
      currentBalances: [balanceRow({ currencyCode: 'USD', totalCash: 0, refTotalCash: 0 })],
      uniqueDates: ['2024-05-10', '2024-05-11'],
      maxDate: '2024-05-11',
      getExchangeRate: identityRate,
      todayKey: '2024-05-11',
    });
    expect(result.has('2024-05-10')).toBe(false);
    // The today-cell overwrite still writes 0: todayKey (2024-05-11) is inside the window.
    expect(result.get('2024-05-11')).toBe(0);
  });

  it('keeps per-currency balances separated (no accumulator bleed across currencies)', () => {
    // EUR cash 100 + AED cash 200 with different FX rates per currency. The
    // running balances must not contaminate each other — applying USD→AED to
    // the EUR running balance is the bleed bug this guards.
    const deltas = new Map<string, Map<string, number>>();
    deltas.set('EUR', new Map([['2024-05-10', 100]]));
    deltas.set('AED', new Map([['2024-05-10', 200]]));
    const result = computePortfolioCashByDate({
      cashDeltaByCurrencyDay: deltas,
      currentBalances: [
        balanceRow({ portfolioId: 'p1', currencyCode: 'EUR', totalCash: 100, refTotalCash: 200 }),
        balanceRow({ portfolioId: 'p2', currencyCode: 'AED', totalCash: 200, refTotalCash: 200 }),
      ],
      uniqueDates: ['2024-05-10'],
      maxDate: '2024-05-10',
      // EUR converts at 2 (EUR 100 * 2 = 200); AED stays at 1 (AED 200 * 1 = 200) — total 400.
      getExchangeRate: (currency) => (currency === 'EUR' ? 2 : 1),
      todayKey: '2099-01-01', // todayKey past the window so we measure pure replay math.
    });
    expect(result.get('2024-05-10')).toBe(400);
  });

  it('aggregates stored cash from multiple rows in the same currency', () => {
    // Two PortfolioBalances rows for different portfolios but same currency
    // should sum into a single seed.
    const result = computePortfolioCashByDate({
      cashDeltaByCurrencyDay: new Map(),
      currentBalances: [
        balanceRow({ portfolioId: 'p1', currencyCode: 'USD', totalCash: 300, refTotalCash: 300 }),
        balanceRow({ portfolioId: 'p2', currencyCode: 'USD', totalCash: 200, refTotalCash: 200 }),
      ],
      uniqueDates: ['2024-05-10'],
      maxDate: '2024-05-10',
      getExchangeRate: identityRate,
      todayKey: '2024-05-10',
    });
    // refTotalCash sum overwrite on the today cell → 500.
    expect(result.get('2024-05-10')).toBe(500);
  });

  it('does not emit the today-cell overwrite when todayKey predates the window', () => {
    // todayKey before firstDate → today is outside the window → skip the overwrite.
    const result = computePortfolioCashByDate({
      cashDeltaByCurrencyDay: new Map(),
      currentBalances: [balanceRow({ currencyCode: 'USD', totalCash: 500, refTotalCash: 999 })],
      uniqueDates: ['2024-05-10', '2024-05-11'],
      maxDate: '2024-05-11',
      getExchangeRate: identityRate,
      todayKey: '2024-01-01',
    });
    // No overwrite; the running-balance path produces 500 (seed) on every day.
    expect(result.get('2024-05-11')).toBe(500);
  });

  it('reconstructs a past-only window correctly when deltas exist AFTER maxDate, with no today-cell overwrite', () => {
    // Stored cash is as-of-TODAY, so deltas between maxDate and today must be
    // fed in: the seed subtracts them and the per-day loop (capped at
    // uniqueDates <= maxDate) never re-adds them. If they were missing from
    // the map, every historical day would read shifted by their sum (+200
    // here) — the anchor-smear bug this test pins.
    const deltas = new Map<string, Map<string, number>>();
    deltas.set(
      'USD',
      new Map([
        ['2024-05-10', 500], // in-window deposit
        ['2024-05-20', 200], // post-window deposit (before today)
      ]),
    );
    const result = computePortfolioCashByDate({
      cashDeltaByCurrencyDay: deltas,
      currentBalances: [balanceRow({ currencyCode: 'USD', totalCash: 700, refTotalCash: 700 })],
      uniqueDates: ['2024-05-09', '2024-05-10', '2024-05-11'],
      maxDate: '2024-05-11',
      getExchangeRate: identityRate,
      todayKey: '2024-06-01',
    });
    // Seed = 700 - (500 + 200) = 0. Day 09: 0 → no entry. Days 10-11: 500.
    expect(result.has('2024-05-09')).toBe(false);
    expect(result.get('2024-05-10')).toBe(500);
    // maxDate keeps its replayed value — today's refTotalCash (700) must NOT
    // be stamped onto a historical date.
    expect(result.get('2024-05-11')).toBe(500);
  });

  it('combines pre-window, in-window, and post-window deltas into exact per-day values', () => {
    // Stored 1000 as-of-today. Deltas: +200 before the window, -300 inside it,
    // +1100 after maxDate but before today. Seed = 1000 - (200 - 300 + 1100) = 0.
    // Pre-window loop: +200. Day 10: 200. Day 11: 200 - 300 = -100. Day 12: -100.
    const deltas = new Map<string, Map<string, number>>();
    deltas.set(
      'USD',
      new Map([
        ['2024-05-01', 200],
        ['2024-05-11', -300],
        ['2024-06-01', 1100],
      ]),
    );
    const result = computePortfolioCashByDate({
      cashDeltaByCurrencyDay: deltas,
      currentBalances: [balanceRow({ currencyCode: 'USD', totalCash: 1000, refTotalCash: 1000 })],
      uniqueDates: ['2024-05-10', '2024-05-11', '2024-05-12'],
      maxDate: '2024-05-12',
      getExchangeRate: identityRate,
      todayKey: '2024-06-05',
    });
    expect(result.get('2024-05-10')).toBe(200);
    expect(result.get('2024-05-11')).toBe(-100);
    expect(result.get('2024-05-12')).toBe(-100);
  });

  it('emits nothing on a day whose running balance crosses to exactly zero, then resumes on later deltas', () => {
    // Running starts positive from a pre-window deposit, a mid-window
    // withdrawal brings it to exactly 0 (no entry emitted for that day), and
    // a later deposit resumes the series.
    const deltas = new Map<string, Map<string, number>>();
    deltas.set(
      'USD',
      new Map([
        ['2024-05-01', 100], // pre-window deposit
        ['2024-05-11', -100], // in-window withdrawal → running hits exactly 0
        ['2024-05-12', 50], // in-window deposit → series resumes
      ]),
    );
    const result = computePortfolioCashByDate({
      cashDeltaByCurrencyDay: deltas,
      currentBalances: [balanceRow({ currencyCode: 'USD', totalCash: 50, refTotalCash: 50 })],
      uniqueDates: ['2024-05-10', '2024-05-11', '2024-05-12'],
      maxDate: '2024-05-12',
      getExchangeRate: identityRate,
      todayKey: '2024-06-01',
    });
    expect(result.get('2024-05-10')).toBe(100);
    expect(result.has('2024-05-11')).toBe(false);
    expect(result.get('2024-05-12')).toBe(50);
  });
});
