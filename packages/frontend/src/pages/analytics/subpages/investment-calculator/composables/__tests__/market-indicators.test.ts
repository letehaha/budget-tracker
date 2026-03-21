import { describe, expect, it } from 'vitest';

import { CUSTOM_INDICATOR_ID, getIndicatorById, MARKET_INDICATORS } from '../market-indicators';

describe('market-indicators', () => {
  it('getIndicatorById returns undefined for unknown id', () => {
    expect(getIndicatorById({ id: 'nonexistent' })).toBeUndefined();
  });

  it('CUSTOM_INDICATOR_ID is not present in MARKET_INDICATORS', () => {
    const ids = MARKET_INDICATORS.map((i) => i.id);
    expect(ids).not.toContain(CUSTOM_INDICATOR_ID);
  });

  it('all indicators have non-zero avgAnnualReturn', () => {
    for (const indicator of MARKET_INDICATORS) {
      expect(indicator.avgAnnualReturn).not.toBe(0);
    }
  });

  it('getIndicatorById returns correct indicator', () => {
    const result = getIndicatorById({ id: 'sp500' });
    expect(result).toBeDefined();
    expect(result!.id).toBe('sp500');
    expect(result!.label).toBe('S&P 500');
  });
});
