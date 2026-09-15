import { DISPLAY_PRICES, MAX_YEARLY_SAVINGS_PERCENT, yearlySavings } from '@/common/const/billing';
import { describe, expect, it } from 'vitest';

describe('yearlySavings', () => {
  it('returns what a year costs monthly minus the yearly price', () => {
    expect(yearlySavings({ tier: 'essential' })).toBe(
      DISPLAY_PRICES.essential.month * 12 - DISPLAY_PRICES.essential.year,
    );
    expect(yearlySavings({ tier: 'plus' })).toBe(DISPLAY_PRICES.plus.month * 12 - DISPLAY_PRICES.plus.year);
  });

  it('is a positive amount for every tier, so the yearly cycle is never the worse deal', () => {
    expect(yearlySavings({ tier: 'essential' })).toBeGreaterThan(0);
    expect(yearlySavings({ tier: 'plus' })).toBeGreaterThan(0);
  });
});

describe('MAX_YEARLY_SAVINGS_PERCENT', () => {
  it('is the largest whole-percent discount across tiers', () => {
    const percents = (['essential', 'plus'] as const).map((tier) =>
      Math.round((yearlySavings({ tier }) / (DISPLAY_PRICES[tier].month * 12)) * 100),
    );

    expect(MAX_YEARLY_SAVINGS_PERCENT).toBe(Math.max(...percents));
    expect(MAX_YEARLY_SAVINGS_PERCENT).toBeLessThan(100);
  });
});
