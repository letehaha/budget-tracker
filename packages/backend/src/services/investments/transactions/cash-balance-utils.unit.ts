import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { describe, expect, it } from '@jest/globals';

import { calculateRefCashDelta } from './cash-balance-utils';

describe('calculateRefCashDelta', () => {
  const buildParams = (overrides: Partial<Parameters<typeof calculateRefCashDelta>[0]>) => ({
    category: INVESTMENT_TRANSACTION_CATEGORY.buy,
    refFees: '0',
    refAmount: '100',
    ...overrides,
  });

  it('treats buys as cash outflow including fees', () => {
    expect(calculateRefCashDelta(buildParams({ refAmount: '1005' }))).toBe(-1005);
  });

  it('treats sells as net proceeds after fees, not refAmount including fees', () => {
    expect(
      calculateRefCashDelta(
        buildParams({
          category: INVESTMENT_TRANSACTION_CATEGORY.sell,
          refFees: '10',
          refAmount: '610',
        }),
      ),
    ).toBe(590);
  });

  it('treats dividends as net cash received after fees', () => {
    expect(
      calculateRefCashDelta(
        buildParams({
          category: INVESTMENT_TRANSACTION_CATEGORY.dividend,
          refFees: '3',
          refAmount: '23',
        }),
      ),
    ).toBe(17);
  });

  it('treats standalone fees and taxes as cash outflows', () => {
    expect(
      calculateRefCashDelta(
        buildParams({
          category: INVESTMENT_TRANSACTION_CATEGORY.fee,
          refAmount: '25',
        }),
      ),
    ).toBe(-25);

    expect(
      calculateRefCashDelta(
        buildParams({
          category: INVESTMENT_TRANSACTION_CATEGORY.tax,
          refAmount: '50',
        }),
      ),
    ).toBe(-50);
  });

  it('ignores categories without cash impact', () => {
    expect(calculateRefCashDelta(buildParams({ category: INVESTMENT_TRANSACTION_CATEGORY.transfer }))).toBeNull();
    expect(calculateRefCashDelta(buildParams({ category: INVESTMENT_TRANSACTION_CATEGORY.cancel }))).toBeNull();
    expect(calculateRefCashDelta(buildParams({ category: INVESTMENT_TRANSACTION_CATEGORY.other }))).toBeNull();
  });
});
