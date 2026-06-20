import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { describe, expect, it } from '@jest/globals';
import { Big } from 'big.js';

import { type HoldingTotalsLeg, computeHoldingTotals } from './holding-totals';

const buy = (quantity: number, amount: number, refAmount = amount): HoldingTotalsLeg => ({
  category: INVESTMENT_TRANSACTION_CATEGORY.buy,
  quantity: new Big(quantity),
  amount: new Big(amount),
  refAmount: new Big(refAmount),
});

// Sell proceeds don't affect cost basis (basis reduces proportionally to shares
// left), so the amount is irrelevant — pass it only for readability.
const sell = (quantity: number, proceeds = 0, refProceeds = proceeds): HoldingTotalsLeg => ({
  category: INVESTMENT_TRANSACTION_CATEGORY.sell,
  quantity: new Big(quantity),
  amount: new Big(proceeds),
  refAmount: new Big(refProceeds),
});

const nonPositional = (category: INVESTMENT_TRANSACTION_CATEGORY, amount = 0): HoldingTotalsLeg => ({
  category,
  quantity: new Big(0),
  amount: new Big(amount),
  refAmount: new Big(amount),
});

const totals = (transactions: HoldingTotalsLeg[]) => {
  const result = computeHoldingTotals({ transactions });
  return {
    quantity: result.quantity.toNumber(),
    costBasis: result.costBasis.toNumber(),
    refCostBasis: result.refCostBasis.toNumber(),
  };
};

describe('computeHoldingTotals', () => {
  describe('replay order sensitivity (the wash-sale bug)', () => {
    // The three legs of a full wash sale: an old cheap lot, the sell that
    // liquidates it, and the rebuy. The recalculation service feeds these in
    // (date, createdAt) order; these two tests pin down WHY that ordering
    // matters by replaying the very same legs both ways.
    const oldLot = buy(10, 500); // 10 @ $50
    const liquidate = sell(10, 600); // 10 @ $60
    const rebuy = buy(10, 700); // 10 @ $70

    it('resets the basis to the rebuy lot when the sell precedes the rebuy', () => {
      expect(totals([oldLot, liquidate, rebuy])).toEqual({
        quantity: 10,
        costBasis: 700, // rebuy lot only
        refCostBasis: 700,
      });
    });

    it('blends the liquidated lot into the basis when the rebuy precedes the sell', () => {
      // Identical legs, rebuy before the sell — the corruption that an
      // unordered same-day replay produced (AC/Share $60 instead of $70).
      expect(totals([oldLot, rebuy, liquidate])).toEqual({
        quantity: 10,
        costBasis: 600, // (500 + 700) halved by the sell
        refCostBasis: 600,
      });
    });
  });

  it('keeps the surviving lot plus the rebuy on a partial wash sale', () => {
    // 20 @ $40 (basis 800), sell 15 (5 survive → basis 200), rebuy 15 @ $60 (+900).
    expect(totals([buy(20, 800), sell(15, 750), buy(15, 900)])).toEqual({
      quantity: 20,
      costBasis: 1100,
      refCostBasis: 1100,
    });
  });

  it('resets to the latest lot across multiple sell-all/rebuy cycles', () => {
    expect(totals([buy(10, 500), sell(10, 600), buy(10, 700), sell(10, 800), buy(10, 900)])).toEqual({
      quantity: 10,
      costBasis: 900, // only the final rebuy survives
      refCostBasis: 900,
    });
  });

  it('does not inflate the basis when the position is sold below zero', () => {
    // Selling from a flat position drives quantity negative (allowed for crypto
    // drift). Without the "quantity ≤ 0 ⇒ basis 0" guard, the later buy's
    // proportional math would balloon the basis instead of leaving it at zero.
    expect(totals([sell(5, 300), buy(3, 210)])).toEqual({
      quantity: -2,
      costBasis: 0,
      refCostBasis: 0,
    });
  });

  it('counts only the above-zero portion when a buy crosses from short to long', () => {
    // sell 5 from flat → qty -5, basis 0; buy 8 @ $800 → crosses to +3. Only the
    // 3 shares above zero are basis: 800 × (3/8) = 300 (the rest covered the short).
    expect(totals([sell(5, 300), buy(8, 800)])).toEqual({
      quantity: 3,
      costBasis: 300,
      refCostBasis: 300,
    });
  });

  it('tracks refCostBasis independently of costBasis through a full reset', () => {
    // Distinct own-currency vs base-currency amounts must stay in lockstep
    // through the reset and rebuy.
    expect(totals([buy(10, 500, 450), sell(10), buy(10, 700, 630)])).toEqual({
      quantity: 10,
      costBasis: 700,
      refCostBasis: 630,
    });
  });

  it('scales costBasis and refCostBasis independently through a partial sell', () => {
    // buy 20 (own $800 / base $720), sell 15 → 5 remain, proportion 5/20 = 0.25.
    // Each currency leg scales by the same proportion off its own running total.
    expect(totals([buy(20, 800, 720), sell(15)])).toEqual({
      quantity: 5,
      costBasis: 200, // 800 × 0.25
      refCostBasis: 180, // 720 × 0.25
    });
  });

  it('treats dividend and fee legs as no-ops for quantity and basis', () => {
    expect(
      totals([
        buy(10, 500),
        nonPositional(INVESTMENT_TRANSACTION_CATEGORY.dividend, 50),
        nonPositional(INVESTMENT_TRANSACTION_CATEGORY.fee, 5),
      ]),
    ).toEqual({
      quantity: 10,
      costBasis: 500,
      refCostBasis: 500,
    });
  });

  it('returns zeroes for an empty transaction list', () => {
    expect(totals([])).toEqual({ quantity: 0, costBasis: 0, refCostBasis: 0 });
  });
});

/**
 * The migration `20260620000000-recalculate-holding-cost-basis` cannot import
 * `computeHoldingTotals` — the production image ships only `dist/` + `src/migrations`,
 * not the service layer — so it inlines a frozen copy (`foldCostBasis`) driven by
 * raw SQL string rows instead of Big/enum legs. This pins the two implementations
 * together: if the copy ever drifts from the live fold, these assertions fail.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require('../../../migrations/20260620000000-recalculate-holding-cost-basis');
const foldCostBasis = migration.foldCostBasis as (args: {
  transactions: { category: string; quantity: string; amount: string; refAmount: string }[];
}) => { costBasis: Big; refCostBasis: Big };

describe('migration foldCostBasis parity with computeHoldingTotals', () => {
  // Raw rows in the shape the migration reads from Postgres (DECIMAL → string).
  type RawRow = { category: string; quantity: string; amount: string; refAmount: string };
  const SCENARIOS: { name: string; rows: RawRow[] }[] = [
    {
      name: 'full same-day wash sale',
      rows: [
        { category: 'buy', quantity: '10', amount: '500', refAmount: '450' },
        { category: 'sell', quantity: '10', amount: '600', refAmount: '540' },
        { category: 'buy', quantity: '10', amount: '700', refAmount: '630' },
      ],
    },
    {
      name: 'partial sell then rebuy',
      rows: [
        { category: 'buy', quantity: '20', amount: '800', refAmount: '720' },
        { category: 'sell', quantity: '15', amount: '750', refAmount: '675' },
        { category: 'buy', quantity: '15', amount: '900', refAmount: '810' },
      ],
    },
    {
      name: 'buy crossing from short to long',
      rows: [
        { category: 'sell', quantity: '5', amount: '300', refAmount: '270' },
        { category: 'buy', quantity: '8', amount: '800', refAmount: '640' },
      ],
    },
    {
      name: 'dividend and fee no-ops',
      rows: [
        { category: 'buy', quantity: '10', amount: '500', refAmount: '500' },
        { category: 'dividend', quantity: '0', amount: '50', refAmount: '50' },
        { category: 'fee', quantity: '0', amount: '5', refAmount: '5' },
      ],
    },
    { name: 'empty ledger', rows: [] },
  ];

  it.each(SCENARIOS)('produces identical cost basis for: $name', ({ rows }) => {
    const live = computeHoldingTotals({
      transactions: rows.map((r) => ({
        category: r.category as INVESTMENT_TRANSACTION_CATEGORY,
        quantity: new Big(r.quantity),
        amount: new Big(r.amount),
        refAmount: new Big(r.refAmount),
      })),
    });
    const frozen = foldCostBasis({ transactions: rows });

    expect(frozen.costBasis.toFixed(10)).toBe(live.costBasis.toFixed(10));
    expect(frozen.refCostBasis.toFixed(10)).toBe(live.refCostBasis.toFixed(10));
  });
});
