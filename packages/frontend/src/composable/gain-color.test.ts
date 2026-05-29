import { getGainColorClass } from './gain-color';

describe('getGainColorClass', () => {
  it('returns income color for a positive gain', () => {
    expect(getGainColorClass({ gainValue: 100 })).toBe('text-app-income-color');
    expect(getGainColorClass({ gainValue: 0.01 })).toBe('text-app-income-color');
  });

  it('returns destructive color for a negative gain', () => {
    expect(getGainColorClass({ gainValue: -100 })).toBe('text-destructive-text');
    expect(getGainColorClass({ gainValue: -0.01 })).toBe('text-destructive-text');
  });

  it('returns muted color for exactly zero', () => {
    expect(getGainColorClass({ gainValue: 0 })).toBe('text-muted-foreground');
  });

  // Regression guard for the zero-cost-basis bug: when a holding has $0 cost basis
  // (airdrops, freebies, fully-divested positions), the percent collapses to 0%
  // even when the dollar gain is non-zero. Color must follow the dollar gain.
  it('colors a positive gain green even when the corresponding percent would be 0', () => {
    const realizedGainOnZeroCostBasis = 155.06;
    expect(getGainColorClass({ gainValue: realizedGainOnZeroCostBasis })).toBe('text-app-income-color');
  });
});
