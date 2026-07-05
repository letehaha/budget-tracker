import { describe, expect, it } from 'vitest';

import { type PivotLiveConfig, buildSavedPivotConfig } from './use-pivot-report';

const baseConfig: PivotLiveConfig = {
  rowDimension: 'category',
  granularity: 'monthly',
  measure: 'expense',
  period: { from: new Date(2024, 0, 1), to: new Date(2024, 11, 31) },
  accountIds: [],
  categoryIds: [],
  payeeIds: [],
  heatmap: true,
  showDelta: false,
};

describe('buildSavedPivotConfig', () => {
  it('collapses empty id arrays to undefined so equality checks stay stable', () => {
    const result = buildSavedPivotConfig({ config: baseConfig });
    expect(result.accountIds).toBeUndefined();
    expect(result.categoryIds).toBeUndefined();
    expect(result.payeeIds).toBeUndefined();
  });

  it('passes non-empty id arrays through unchanged', () => {
    const result = buildSavedPivotConfig({
      config: { ...baseConfig, accountIds: ['a1'], categoryIds: ['c1', 'c2'], payeeIds: ['p1'] },
    });
    expect(result.accountIds).toEqual(['a1']);
    expect(result.categoryIds).toEqual(['c1', 'c2']);
    expect(result.payeeIds).toEqual(['p1']);
  });

  it('flattens the period to yyyy-MM-dd strings and passes scalar fields through', () => {
    const result = buildSavedPivotConfig({
      config: {
        ...baseConfig,
        rowDimension: 'payee',
        granularity: 'weekly',
        measure: 'income',
        heatmap: false,
        showDelta: true,
        period: { from: new Date(2023, 5, 7), to: new Date(2023, 5, 30) },
      },
    });
    expect(result.from).toBe('2023-06-07');
    expect(result.to).toBe('2023-06-30');
    expect(result.rowDimension).toBe('payee');
    expect(result.granularity).toBe('weekly');
    expect(result.measure).toBe('income');
    expect(result.heatmap).toBe(false);
    expect(result.showDelta).toBe(true);
  });
});
