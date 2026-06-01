import type { HoldingModel } from '@bt/shared/types/investments';

import { groupHoldings, isClosedPosition, sortHoldings } from './holding-display';

const makeHolding = (overrides: Partial<HoldingModel> & { symbol?: string }): HoldingModel => {
  const { symbol, ...rest } = overrides;
  return {
    portfolioId: 'p1',
    securityId: symbol ?? 'sec',
    quantity: '0',
    costBasis: '0',
    refCostBasis: '0',
    currencyCode: 'USD',
    excluded: false,
    security: symbol ? ({ symbol, name: symbol } as HoldingModel['security']) : undefined,
    ...rest,
  };
};

describe('isClosedPosition', () => {
  it('treats a zero quantity as closed', () => {
    expect(isClosedPosition(makeHolding({ quantity: '0' }))).toBe(true);
  });

  it('treats any non-zero quantity as active', () => {
    expect(isClosedPosition(makeHolding({ quantity: '10' }))).toBe(false);
    expect(isClosedPosition(makeHolding({ quantity: '0.5' }))).toBe(false);
    // Crypto drift residue is still a real (if small) position, not closed.
    expect(isClosedPosition(makeHolding({ quantity: '-0.000492' }))).toBe(false);
  });
});

describe('sortHoldings', () => {
  it('sorts by symbol ascending and descending', () => {
    const holdings = [
      makeHolding({ symbol: 'SONY', quantity: '1' }),
      makeHolding({ symbol: 'BAC', quantity: '1' }),
      makeHolding({ symbol: 'FIG', quantity: '1' }),
    ];

    expect(sortHoldings({ holdings, sortKey: 'symbol', sortDir: 'asc' }).map((h) => h.security?.symbol)).toEqual([
      'BAC',
      'FIG',
      'SONY',
    ]);
    expect(sortHoldings({ holdings, sortKey: 'symbol', sortDir: 'desc' }).map((h) => h.security?.symbol)).toEqual([
      'SONY',
      'FIG',
      'BAC',
    ]);
  });

  it('sorts numerically by market value', () => {
    const holdings = [
      makeHolding({ symbol: 'A', quantity: '1', marketValue: '100' }),
      makeHolding({ symbol: 'B', quantity: '1', marketValue: '2000' }),
      makeHolding({ symbol: 'C', quantity: '1', marketValue: '50' }),
    ];

    expect(sortHoldings({ holdings, sortKey: 'value', sortDir: 'asc' }).map((h) => h.security?.symbol)).toEqual([
      'C',
      'A',
      'B',
    ]);
  });

  it('does not mutate the input array', () => {
    const holdings = [makeHolding({ symbol: 'B', quantity: '1' }), makeHolding({ symbol: 'A', quantity: '1' })];
    sortHoldings({ holdings, sortKey: 'symbol', sortDir: 'asc' });
    expect(holdings.map((h) => h.security?.symbol)).toEqual(['B', 'A']);
  });
});

describe('groupHoldings', () => {
  it('separates active from closed positions, each sorted independently', () => {
    const holdings = [
      makeHolding({ symbol: 'SONY', quantity: '20', marketValue: '434' }),
      makeHolding({ symbol: 'BAC', quantity: '0', marketValue: '0' }),
      makeHolding({ symbol: 'FIG', quantity: '14', marketValue: '328' }),
      makeHolding({ symbol: 'VST', quantity: '0', marketValue: '0' }),
    ];

    const { active, closed } = groupHoldings({ holdings, sortKey: 'symbol', sortDir: 'asc' });

    expect(active.map((h) => h.security?.symbol)).toEqual(['FIG', 'SONY']);
    expect(closed.map((h) => h.security?.symbol)).toEqual(['BAC', 'VST']);
  });

  it('returns empty closed group when no positions are closed', () => {
    const holdings = [makeHolding({ symbol: 'A', quantity: '1' }), makeHolding({ symbol: 'B', quantity: '2' })];
    const { active, closed } = groupHoldings({ holdings, sortKey: 'symbol', sortDir: 'asc' });
    expect(active).toHaveLength(2);
    expect(closed).toHaveLength(0);
  });
});
