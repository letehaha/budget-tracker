import { SUBSCRIPTION_FREQUENCIES } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import {
  type LinkedPaymentLike,
  type LinkedPaymentsChartBar,
  type LinkedPaymentsChartGap,
  type LinkedPaymentsChartSlot,
  buildLinkedPaymentsSummary,
} from './linked-payments-summary';

interface TestPayment extends LinkedPaymentLike {
  note: string;
}

const buildTx = (overrides: Partial<TestPayment> = {}): TestPayment => ({
  id: 'tx-1',
  amount: 100,
  refAmount: 100,
  currencyCode: 'UAH',
  refCurrencyCode: 'UAH',
  time: '2025-01-12T10:00:00.000Z',
  note: 'wFirma',
  ...overrides,
});

const buildSummary = ({
  transactions,
  frequency = SUBSCRIPTION_FREQUENCIES.monthly,
}: {
  transactions: TestPayment[];
  frequency?: SUBSCRIPTION_FREQUENCIES;
}) => buildLinkedPaymentsSummary({ transactions, frequency });

const paymentBars = ({ chart }: { chart: LinkedPaymentsChartSlot[] | null }): LinkedPaymentsChartBar[] =>
  (chart ?? []).filter((slot): slot is LinkedPaymentsChartBar => slot.kind === 'payment');

const gaps = ({ chart }: { chart: LinkedPaymentsChartSlot[] | null }): LinkedPaymentsChartGap[] =>
  (chart ?? []).filter((slot): slot is LinkedPaymentsChartGap => slot.kind === 'gap');

describe('buildLinkedPaymentsSummary', () => {
  it('sorts payments newest-first regardless of input order', () => {
    const summary = buildSummary({
      transactions: [
        buildTx({ id: 'mid', time: '2025-05-12T10:00:00.000Z' }),
        buildTx({ id: 'oldest', time: '2025-02-12T10:00:00.000Z' }),
        buildTx({ id: 'newest', time: '2025-07-12T10:00:00.000Z' }),
      ],
    });

    expect(summary.payments.map((p) => p.id)).toEqual(['newest', 'mid', 'oldest']);
  });

  it('accepts Date and ISO-string times together', () => {
    const summary = buildSummary({
      transactions: [
        buildTx({ id: 'string', time: '2025-03-12T10:00:00.000Z' }),
        buildTx({ id: 'date', time: new Date('2025-09-12T10:00:00.000Z') }),
      ],
    });

    expect(summary.payments.map((p) => p.id)).toEqual(['date', 'string']);
  });

  it('groups payments by year, newest year first, with newest-first rows', () => {
    const summary = buildSummary({
      transactions: [
        buildTx({ id: 'a', time: '2024-11-12T10:00:00.000Z' }),
        buildTx({ id: 'b', time: '2026-01-12T10:00:00.000Z' }),
        buildTx({ id: 'c', time: '2026-07-12T10:00:00.000Z' }),
      ],
    });

    expect(summary.yearGroups.map((group) => group.year)).toEqual([2026, 2024]);
    expect(summary.yearGroups[0]!.payments.map((p) => p.id)).toEqual(['c', 'b']);
    expect(summary.yearGroups[1]!.payments.map((p) => p.id)).toEqual(['a']);
  });

  it('totals each year per currency, dominant currency first', () => {
    const summary = buildSummary({
      transactions: [
        buildTx({ id: 'a', amount: 700, currencyCode: 'UAH', time: '2025-02-12T10:00:00.000Z' }),
        buildTx({ id: 'b', amount: 66.55, currencyCode: 'PLN', time: '2025-05-12T10:00:00.000Z' }),
        buildTx({ id: 'c', amount: 800, currencyCode: 'UAH', time: '2025-11-12T10:00:00.000Z' }),
      ],
    });

    expect(summary.yearGroups[0]!.totalsByCurrency).toEqual([
      { currencyCode: 'UAH', total: 1500 },
      { currencyCode: 'PLN', total: 66.55 },
    ]);
  });

  it('totals all payments per currency with the dominant currency first', () => {
    const summary = buildSummary({
      transactions: [
        buildTx({ id: 'a', amount: 50, currencyCode: 'PLN', time: '2024-02-12T10:00:00.000Z' }),
        buildTx({ id: 'b', amount: 700, currencyCode: 'UAH', time: '2025-02-12T10:00:00.000Z' }),
        buildTx({ id: 'c', amount: 750, currencyCode: 'UAH', time: '2026-02-12T10:00:00.000Z' }),
      ],
    });

    expect(summary.stats.totalsByCurrency).toEqual([
      { currencyCode: 'UAH', total: 1450 },
      { currencyCode: 'PLN', total: 50 },
    ]);
  });

  it('builds the chart oldest-first, scaling heights across the refAmount range', () => {
    const summary = buildSummary({
      transactions: [
        buildTx({ id: 'p4', refAmount: 1200, time: '2026-04-12T10:00:00.000Z' }),
        buildTx({ id: 'p3', refAmount: 800, time: '2026-03-12T10:00:00.000Z' }),
        buildTx({ id: 'p2', refAmount: 600, time: '2026-02-12T10:00:00.000Z' }),
        buildTx({ id: 'p1', refAmount: 400, time: '2026-01-12T10:00:00.000Z' }),
      ],
    });

    const bars = paymentBars({ chart: summary.chart });
    expect(bars.map((bar) => bar.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(bars.map((bar) => bar.heightPct)).toEqual([30, 47.5, 65, 100]);
    expect(bars.map((bar) => bar.isLatest)).toEqual([false, false, false, true]);
    expect(bars[0]!.monthLabel).toBe('Jan 26');
  });

  it('renders equal payments as full-height bars', () => {
    const summary = buildSummary({
      transactions: [
        buildTx({ id: 'a', refAmount: 750, time: '2026-01-12T10:00:00.000Z' }),
        buildTx({ id: 'b', refAmount: 750, time: '2026-02-12T10:00:00.000Z' }),
        buildTx({ id: 'c', refAmount: 750, time: '2026-03-12T10:00:00.000Z' }),
        buildTx({ id: 'd', refAmount: 750, time: '2026-04-12T10:00:00.000Z' }),
      ],
    });

    expect(paymentBars({ chart: summary.chart }).map((bar) => bar.heightPct)).toEqual([100, 100, 100, 100]);
  });

  it('keeps bars visible when every payment has a zero refAmount', () => {
    const summary = buildSummary({
      transactions: [
        buildTx({ id: 'a', refAmount: 0, time: '2026-01-12T10:00:00.000Z' }),
        buildTx({ id: 'b', refAmount: 0, time: '2026-02-12T10:00:00.000Z' }),
        buildTx({ id: 'c', refAmount: 0, time: '2026-03-12T10:00:00.000Z' }),
        buildTx({ id: 'd', refAmount: 0, time: '2026-04-12T10:00:00.000Z' }),
      ],
    });

    expect(paymentBars({ chart: summary.chart }).map((bar) => bar.heightPct)).toEqual([8, 8, 8, 8]);
  });

  it('scales mixed-currency payments off refAmount and exposes both amounts', () => {
    const summary = buildSummary({
      transactions: [
        buildTx({
          id: 'pln',
          amount: 66.55,
          currencyCode: 'PLN',
          refAmount: 715.3,
          refCurrencyCode: 'UAH',
          time: '2025-05-12T10:00:00.000Z',
        }),
        buildTx({ id: 'uah-1', amount: 740.82, refAmount: 740.82, time: '2025-06-12T10:00:00.000Z' }),
        buildTx({ id: 'uah-2', amount: 740.82, refAmount: 740.82, time: '2025-07-12T10:00:00.000Z' }),
        buildTx({ id: 'uah-3', amount: 740.82, refAmount: 740.82, time: '2025-08-12T10:00:00.000Z' }),
      ],
    });

    const bars = paymentBars({ chart: summary.chart });
    const plnBar = bars[0]!;
    expect(plnBar.id).toBe('pln');
    expect(plnBar.amount).toBe(66.55);
    expect(plnBar.currencyCode).toBe('PLN');
    expect(plnBar.refAmount).toBe(715.3);
    expect(plnBar.refCurrencyCode).toBe('UAH');
    expect(plnBar.heightPct).toBe(30);
    expect(bars[1]!.heightPct).toBe(100);
  });

  it('averages payments in the dominant currency and reports the last payment', () => {
    const summary = buildSummary({
      transactions: [
        buildTx({ id: 'a', amount: 66.55, currencyCode: 'PLN', refAmount: 700, time: '2025-02-12T10:00:00.000Z' }),
        buildTx({ id: 'b', amount: 700, refAmount: 700, time: '2025-05-12T10:00:00.000Z' }),
        buildTx({ id: 'c', amount: 800, refAmount: 800, time: '2025-07-12T10:00:00.000Z' }),
      ],
    });

    expect(summary.stats.average).toEqual({ amount: 750, currencyCode: 'UAH' });
    expect(summary.stats.lastPaymentTime).toEqual(new Date('2025-07-12T10:00:00.000Z'));
  });

  describe('chart threshold', () => {
    it('returns no chart with three payments', () => {
      const summary = buildSummary({
        transactions: [
          buildTx({ id: 'a', time: '2026-01-12T10:00:00.000Z' }),
          buildTx({ id: 'b', time: '2026-02-12T10:00:00.000Z' }),
          buildTx({ id: 'c', time: '2026-03-12T10:00:00.000Z' }),
        ],
      });

      expect(summary.chart).toBeNull();
    });

    it('returns slots once a fourth payment lands', () => {
      const summary = buildSummary({
        transactions: [
          buildTx({ id: 'a', time: '2026-01-12T10:00:00.000Z' }),
          buildTx({ id: 'b', time: '2026-02-12T10:00:00.000Z' }),
          buildTx({ id: 'c', time: '2026-03-12T10:00:00.000Z' }),
          buildTx({ id: 'd', time: '2026-04-12T10:00:00.000Z' }),
        ],
      });

      expect(summary.chart).toHaveLength(4);
      expect(summary.chart!.map((slot) => slot.kind)).toEqual(['payment', 'payment', 'payment', 'payment']);
    });
  });

  describe('gap slots', () => {
    it('inserts one gap between payments that skipped a monthly period', () => {
      const summary = buildSummary({
        transactions: [
          buildTx({ id: 'a', time: '2026-01-12T10:00:00.000Z' }),
          buildTx({ id: 'b', time: '2026-02-12T10:00:00.000Z' }),
          buildTx({ id: 'c', time: '2026-04-12T10:00:00.000Z' }),
          buildTx({ id: 'd', time: '2026-05-12T10:00:00.000Z' }),
        ],
      });

      expect(summary.chart!.map((slot) => slot.kind)).toEqual(['payment', 'payment', 'gap', 'payment', 'payment']);
      expect(gaps({ chart: summary.chart })).toEqual([
        { kind: 'gap', id: 'gap-b-c', missedCount: 1, slotCount: 1, rangeLabel: 'Mar 26' },
      ]);
    });

    it('caps a long pause at three slots while keeping the real missed count', () => {
      const summary = buildSummary({
        transactions: [
          buildTx({ id: 'a', time: '2025-01-12T10:00:00.000Z' }),
          buildTx({ id: 'b', time: '2025-02-12T10:00:00.000Z' }),
          buildTx({ id: 'c', time: '2025-03-12T10:00:00.000Z' }),
          buildTx({ id: 'd', time: '2026-03-12T10:00:00.000Z' }),
        ],
      });

      expect(gaps({ chart: summary.chart })).toEqual([
        { kind: 'gap', id: 'gap-c-d', missedCount: 11, slotCount: 3, rangeLabel: 'Apr 25 – Feb 26' },
      ]);
    });

    it('tolerates jittered monthly payment dates', () => {
      const summary = buildSummary({
        transactions: [
          buildTx({ id: 'a', time: '2026-01-12T10:00:00.000Z' }),
          buildTx({ id: 'b', time: '2026-02-09T10:00:00.000Z' }),
          buildTx({ id: 'c', time: '2026-03-16T10:00:00.000Z' }),
          buildTx({ id: 'd', time: '2026-04-10T10:00:00.000Z' }),
        ],
      });

      expect(gaps({ chart: summary.chart })).toEqual([]);
      expect(summary.chart).toHaveLength(4);
    });

    it('tolerates a semi-annual plan renewed a few days late', () => {
      const summary = buildSummary({
        frequency: SUBSCRIPTION_FREQUENCIES.semiAnnual,
        transactions: [
          buildTx({ id: 'a', time: '2025-01-10T10:00:00.000Z' }),
          buildTx({ id: 'b', time: '2025-07-15T10:00:00.000Z' }),
          buildTx({ id: 'c', time: '2026-01-20T10:00:00.000Z' }),
          buildTx({ id: 'd', time: '2026-07-10T10:00:00.000Z' }),
        ],
      });

      expect(gaps({ chart: summary.chart })).toEqual([]);
      expect(summary.chart).toHaveLength(4);
    });

    it('keeps two payments inside one period adjacent', () => {
      const summary = buildSummary({
        transactions: [
          buildTx({ id: 'a', time: '2026-01-12T10:00:00.000Z' }),
          buildTx({ id: 'a-refund', time: '2026-01-14T10:00:00.000Z' }),
          buildTx({ id: 'b', time: '2026-02-12T10:00:00.000Z' }),
          buildTx({ id: 'c', time: '2026-03-12T10:00:00.000Z' }),
        ],
      });

      expect(gaps({ chart: summary.chart })).toEqual([]);
      expect(paymentBars({ chart: summary.chart }).map((bar) => bar.id)).toEqual(['a', 'a-refund', 'b', 'c']);
    });
  });

  it('reports upward drift between the first and the latest payment', () => {
    const summary = buildSummary({
      transactions: [
        buildTx({ id: 'a', refAmount: 691.6, time: '2025-02-12T10:00:00.000Z' }),
        buildTx({ id: 'b', refAmount: 760.71, time: '2025-08-12T10:00:00.000Z' }),
        buildTx({ id: 'c', refAmount: 873.26, time: '2026-07-12T10:00:00.000Z' }),
      ],
    });

    expect(summary.drift).toEqual({
      percent: 26,
      direction: 'up',
      firstPaymentTime: new Date('2025-02-12T10:00:00.000Z'),
    });
  });

  it('reports downward drift as an absolute percentage', () => {
    const summary = buildSummary({
      transactions: [
        buildTx({ id: 'a', refAmount: 1000, time: '2025-02-12T10:00:00.000Z' }),
        buildTx({ id: 'b', refAmount: 900, time: '2025-08-12T10:00:00.000Z' }),
        buildTx({ id: 'c', refAmount: 750, time: '2026-07-12T10:00:00.000Z' }),
      ],
    });

    expect(summary.drift).toMatchObject({ percent: 25, direction: 'down' });
  });

  it('has no drift with fewer than three payments', () => {
    const summary = buildSummary({
      transactions: [
        buildTx({ id: 'a', refAmount: 500, time: '2025-02-12T10:00:00.000Z' }),
        buildTx({ id: 'b', refAmount: 1000, time: '2025-08-12T10:00:00.000Z' }),
      ],
    });

    expect(summary.drift).toBeNull();
  });

  it('has no drift when the first payment amount is zero', () => {
    const summary = buildSummary({
      transactions: [
        buildTx({ id: 'a', refAmount: 0, time: '2025-02-12T10:00:00.000Z' }),
        buildTx({ id: 'b', refAmount: 500, time: '2025-08-12T10:00:00.000Z' }),
        buildTx({ id: 'c', refAmount: 600, time: '2026-07-12T10:00:00.000Z' }),
      ],
    });

    expect(summary.drift).toBeNull();
  });

  it('has no drift when the change rounds to zero percent', () => {
    const summary = buildSummary({
      transactions: [
        buildTx({ id: 'a', refAmount: 1000, time: '2025-02-12T10:00:00.000Z' }),
        buildTx({ id: 'b', refAmount: 1200, time: '2025-08-12T10:00:00.000Z' }),
        buildTx({ id: 'c', refAmount: 1002, time: '2026-07-12T10:00:00.000Z' }),
      ],
    });

    expect(summary.drift).toBeNull();
  });

  it('has no drift when billing moved to another currency', () => {
    const summary = buildSummary({
      transactions: [
        buildTx({ id: 'a', amount: 149, currencyCode: 'UAH', refAmount: 149, time: '2025-02-12T10:00:00.000Z' }),
        buildTx({ id: 'b', amount: 149, currencyCode: 'UAH', refAmount: 149, time: '2025-08-12T10:00:00.000Z' }),
        buildTx({
          id: 'c',
          amount: 100,
          currencyCode: 'PLN',
          refAmount: 1000,
          refCurrencyCode: 'UAH',
          time: '2026-07-12T10:00:00.000Z',
        }),
      ],
    });

    expect(summary.drift).toBeNull();
  });

  it('keeps drift when only a middle payment used another currency', () => {
    const summary = buildSummary({
      transactions: [
        buildTx({ id: 'a', refAmount: 1000, time: '2025-02-12T10:00:00.000Z' }),
        buildTx({
          id: 'b',
          amount: 100,
          currencyCode: 'PLN',
          refAmount: 1100,
          refCurrencyCode: 'UAH',
          time: '2025-08-12T10:00:00.000Z',
        }),
        buildTx({ id: 'c', refAmount: 1250, time: '2026-07-12T10:00:00.000Z' }),
      ],
    });

    expect(summary.drift).toMatchObject({ percent: 25, direction: 'up' });
  });

  it('returns empty aggregates when nothing is linked', () => {
    const summary = buildSummary({ transactions: [] });

    expect(summary.payments).toEqual([]);
    expect(summary.yearGroups).toEqual([]);
    expect(summary.chart).toBeNull();
    expect(summary.drift).toBeNull();
    expect(summary.stats).toEqual({
      totalsByCurrency: [],
      average: null,
      lastPaymentTime: null,
    });
  });
});
