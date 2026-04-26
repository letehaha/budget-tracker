import { describe, expect, it } from '@jest/globals';

import { calculateTwr } from './twr';

describe('calculateTwr', () => {
  it('returns null when fewer than 2 points', () => {
    expect(calculateTwr({ points: [] })).toBeNull();
    expect(calculateTwr({ points: [{ date: '2024-01-01', value: 1000, cashFlow: 1000 }] })).toBeNull();
  });

  it('single segment, no cash flow: 10% over 1 year → ~10% annualized', () => {
    const result = calculateTwr({
      points: [
        { date: '2024-01-01', value: 1000, cashFlow: 1000 },
        { date: '2025-01-01', value: 1100, cashFlow: 0 },
      ],
    });
    expect(result).not.toBeNull();
    expect(result!.cumulativeReturn).toBeCloseTo(0.1, 6);
    expect(result!.annualizedReturn).toBeCloseTo(0.1, 3);
    expect(result!.segmentsUsed).toBe(1);
  });

  it('single segment with mid-period deposit handled via boundary point', () => {
    // Open with $1000, grew to $1100 by mid-year, deposit $500 → $1600 base for next segment,
    // ends at $1760 (10% over second half).
    const result = calculateTwr({
      points: [
        { date: '2024-01-01', value: 1000, cashFlow: 1000 },
        { date: '2024-07-01', value: 1600, cashFlow: 500 }, // value after CF; CF subtracted out for return calc
        { date: '2025-01-01', value: 1760, cashFlow: 0 },
      ],
    });
    expect(result).not.toBeNull();
    // r1 = (1600 - 500 - 1000) / 1000 = 10%
    // r2 = (1760 - 0 - 1600) / 1600 = 10%
    // cumulative = 1.1 * 1.1 - 1 = 21%
    expect(result!.cumulativeReturn).toBeCloseTo(0.21, 6);
    expect(result!.annualizedReturn).toBeCloseTo(0.21, 2);
  });

  it('strips out the impact of cash flow timing (TWR vs IRR difference)', () => {
    // Same underlying market performance regardless of when the deposit happens.
    const earlyDeposit = calculateTwr({
      points: [
        { date: '2024-01-01', value: 1000, cashFlow: 1000 },
        { date: '2024-02-01', value: 2010, cashFlow: 1000 }, // r1 = 1%
        { date: '2025-01-01', value: 2211, cashFlow: 0 }, // r2 = (2211-2010)/2010 ≈ 10%
      ],
    });
    const lateDeposit = calculateTwr({
      points: [
        { date: '2024-01-01', value: 1000, cashFlow: 1000 },
        // By 2024-12-01 the original 1000 grew to 1010 (+1%), then deposit 1000 → 2010.
        { date: '2024-12-01', value: 2010, cashFlow: 1000 }, // r1 = 1%
        { date: '2025-01-01', value: 2211, cashFlow: 0 }, // r2 = (2211 - 2010)/2010 ≈ 10%
      ],
    });
    expect(earlyDeposit!.cumulativeReturn).toBeCloseTo(lateDeposit!.cumulativeReturn, 4);
  });

  it('handles a withdrawal mid-period', () => {
    // Open at $1000, grew to $1200, withdraw $500 → $700 starts second segment, end at $770.
    const result = calculateTwr({
      points: [
        { date: '2024-01-01', value: 1000, cashFlow: 1000 },
        { date: '2024-07-01', value: 700, cashFlow: -500 },
        { date: '2025-01-01', value: 770, cashFlow: 0 },
      ],
    });
    expect(result).not.toBeNull();
    // r1 = (700 - (-500) - 1000) / 1000 = 0.20
    // r2 = (770 - 0 - 700) / 700 = 0.10
    // cumulative = 1.2 * 1.1 - 1 = 0.32
    expect(result!.cumulativeReturn).toBeCloseTo(0.32, 6);
  });

  it('reports a negative return correctly', () => {
    const result = calculateTwr({
      points: [
        { date: '2024-01-01', value: 1000, cashFlow: 1000 },
        { date: '2025-01-01', value: 800, cashFlow: 0 },
      ],
    });
    expect(result).not.toBeNull();
    expect(result!.cumulativeReturn).toBeCloseTo(-0.2, 6);
    expect(result!.annualizedReturn).toBeCloseTo(-0.2, 2);
  });

  it('skips segments where opening value is zero (no return defined)', () => {
    const result = calculateTwr({
      points: [
        { date: '2024-01-01', value: 0, cashFlow: 0 },
        { date: '2024-02-01', value: 1000, cashFlow: 1000 },
        { date: '2025-02-01', value: 1100, cashFlow: 0 },
      ],
    });
    expect(result).not.toBeNull();
    expect(result!.segmentsUsed).toBe(1);
    expect(result!.cumulativeReturn).toBeCloseTo(0.1, 6);
  });

  it('returns null annualizedReturn when total duration is zero', () => {
    const result = calculateTwr({
      points: [
        { date: '2024-01-01', value: 1000, cashFlow: 1000 },
        { date: '2024-01-01', value: 1100, cashFlow: 0 },
      ],
    });
    expect(result!.cumulativeReturn).toBeCloseTo(0.1, 6);
    expect(result!.annualizedReturn).toBeNull();
  });
});
