import { vi } from 'vitest';

import {
  cellToLinearIndex,
  formatDateSelectorValue,
  getCellLabels,
  getGridColumns,
  getPeriodBoundaries,
  inferFilterMode,
  inferPeriodType,
  isFutureCell,
  parseDateInput,
  periodToCellId,
} from './date-selector-utils';

const date = (year: number, month: number, day: number) => new Date(year, month - 1, day);

describe('getPeriodBoundaries', () => {
  it('returns correct month boundaries', () => {
    const { start, end } = getPeriodBoundaries({ periodType: 'month', year: 2025, index: 0 });
    expect(start).toEqual(date(2025, 1, 1));
    expect(end.getFullYear()).toBe(2025);
    expect(end.getMonth()).toBe(0);
    expect(end.getDate()).toBe(31);
  });

  it('handles February in a leap year', () => {
    const { start, end } = getPeriodBoundaries({ periodType: 'month', year: 2024, index: 1 });
    expect(start).toEqual(date(2024, 2, 1));
    expect(end.getDate()).toBe(29);
  });

  it('handles February in a non-leap year', () => {
    const { end } = getPeriodBoundaries({ periodType: 'month', year: 2025, index: 1 });
    expect(end.getDate()).toBe(28);
  });

  it('returns correct quarter boundaries for Q1', () => {
    const { start, end } = getPeriodBoundaries({ periodType: 'quarter', year: 2025, index: 0 });
    expect(start).toEqual(date(2025, 1, 1));
    expect(end.getMonth()).toBe(2); // March
    expect(end.getDate()).toBe(31);
  });

  it('returns correct quarter boundaries for Q4', () => {
    const { start, end } = getPeriodBoundaries({ periodType: 'quarter', year: 2025, index: 3 });
    expect(start).toEqual(date(2025, 10, 1));
    expect(end.getMonth()).toBe(11); // December
    expect(end.getDate()).toBe(31);
  });

  it('returns correct half-year boundaries for H1', () => {
    const { start, end } = getPeriodBoundaries({ periodType: 'half-year', year: 2025, index: 0 });
    expect(start).toEqual(date(2025, 1, 1));
    expect(end.getMonth()).toBe(5); // June
    expect(end.getDate()).toBe(30);
  });

  it('returns correct half-year boundaries for H2', () => {
    const { start, end } = getPeriodBoundaries({ periodType: 'half-year', year: 2025, index: 1 });
    expect(start).toEqual(date(2025, 7, 1));
    expect(end.getMonth()).toBe(11); // December
    expect(end.getDate()).toBe(31);
  });

  it('returns correct year boundaries', () => {
    const { start, end } = getPeriodBoundaries({ periodType: 'year', year: 2025, index: 0 });
    expect(start).toEqual(date(2025, 1, 1));
    expect(end.getMonth()).toBe(11);
    expect(end.getDate()).toBe(31);
  });

  it('returns full year for unknown period type', () => {
    const { start, end } = getPeriodBoundaries({ periodType: 'day', year: 2025, index: 0 });
    expect(start).toEqual(date(2025, 1, 1));
    expect(end).toEqual(date(2025, 12, 31));
  });
});

describe('cellToLinearIndex', () => {
  it('returns year*12 + index for months', () => {
    expect(cellToLinearIndex({ periodType: 'month', year: 2025, index: 0 })).toBe(2025 * 12);
    expect(cellToLinearIndex({ periodType: 'month', year: 2025, index: 5 })).toBe(2025 * 12 + 5);
  });

  it('returns year*4 + index for quarters', () => {
    expect(cellToLinearIndex({ periodType: 'quarter', year: 2025, index: 0 })).toBe(2025 * 4);
    expect(cellToLinearIndex({ periodType: 'quarter', year: 2025, index: 3 })).toBe(2025 * 4 + 3);
  });

  it('returns year*2 + index for half-year', () => {
    expect(cellToLinearIndex({ periodType: 'half-year', year: 2025, index: 0 })).toBe(2025 * 2);
    expect(cellToLinearIndex({ periodType: 'half-year', year: 2025, index: 1 })).toBe(2025 * 2 + 1);
  });

  it('returns year for year period', () => {
    expect(cellToLinearIndex({ periodType: 'year', year: 2025, index: 0 })).toBe(2025);
  });

  it('returns 0 for unknown period type', () => {
    expect(cellToLinearIndex({ periodType: 'day', year: 2025, index: 0 })).toBe(0);
  });

  it('maintains ordering across years', () => {
    const dec2024 = cellToLinearIndex({ periodType: 'month', year: 2024, index: 11 });
    const jan2025 = cellToLinearIndex({ periodType: 'month', year: 2025, index: 0 });
    expect(jan2025).toBeGreaterThan(dec2024);
  });
});

describe('isFutureCell', () => {
  beforeEach(() => {
    // Mock Date to 2025-06-15 (June 15, 2025)
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('month', () => {
    it('returns false for current month', () => {
      expect(isFutureCell({ periodType: 'month', year: 2025, index: 5 })).toBe(false);
    });

    it('returns false for past month same year', () => {
      expect(isFutureCell({ periodType: 'month', year: 2025, index: 0 })).toBe(false);
    });

    it('returns true for future month same year', () => {
      expect(isFutureCell({ periodType: 'month', year: 2025, index: 6 })).toBe(true);
    });

    it('returns true for any month in a future year', () => {
      expect(isFutureCell({ periodType: 'month', year: 2026, index: 0 })).toBe(true);
    });

    it('returns false for any month in a past year', () => {
      expect(isFutureCell({ periodType: 'month', year: 2024, index: 11 })).toBe(false);
    });
  });

  describe('quarter', () => {
    it('returns false for current quarter (Q2 = index 1, June is in Q2)', () => {
      expect(isFutureCell({ periodType: 'quarter', year: 2025, index: 1 })).toBe(false);
    });

    it('returns true for future quarter same year', () => {
      expect(isFutureCell({ periodType: 'quarter', year: 2025, index: 2 })).toBe(true);
    });

    it('returns false for past quarter same year', () => {
      expect(isFutureCell({ periodType: 'quarter', year: 2025, index: 0 })).toBe(false);
    });
  });

  describe('half-year', () => {
    it('returns false for current half (H1 = index 0, June is in H1)', () => {
      expect(isFutureCell({ periodType: 'half-year', year: 2025, index: 0 })).toBe(false);
    });

    it('returns true for future half same year', () => {
      expect(isFutureCell({ periodType: 'half-year', year: 2025, index: 1 })).toBe(true);
    });
  });

  describe('year', () => {
    it('returns false for current year', () => {
      expect(isFutureCell({ periodType: 'year', year: 2025, index: 0 })).toBe(false);
    });

    it('returns true for future year', () => {
      expect(isFutureCell({ periodType: 'year', year: 2026, index: 0 })).toBe(true);
    });

    it('returns false for past year', () => {
      expect(isFutureCell({ periodType: 'year', year: 2024, index: 0 })).toBe(false);
    });
  });

  it('returns false for unknown period type', () => {
    expect(isFutureCell({ periodType: 'day', year: 3000, index: 0 })).toBe(false);
  });
});

describe('inferPeriodType', () => {
  it('returns "year" for a full year period', () => {
    expect(inferPeriodType({ period: { from: date(2025, 1, 1), to: date(2025, 12, 31) } })).toBe('year');
  });

  it('returns "half-year" for H1', () => {
    expect(inferPeriodType({ period: { from: date(2025, 1, 1), to: date(2025, 6, 30) } })).toBe('half-year');
  });

  it('returns "half-year" for H2', () => {
    expect(inferPeriodType({ period: { from: date(2025, 7, 1), to: date(2025, 12, 31) } })).toBe('half-year');
  });

  it('returns "quarter" for Q1', () => {
    expect(inferPeriodType({ period: { from: date(2025, 1, 1), to: date(2025, 3, 31) } })).toBe('quarter');
  });

  it('returns "quarter" for Q2', () => {
    expect(inferPeriodType({ period: { from: date(2025, 4, 1), to: date(2025, 6, 30) } })).toBe('quarter');
  });

  it('returns "quarter" for Q3', () => {
    expect(inferPeriodType({ period: { from: date(2025, 7, 1), to: date(2025, 9, 30) } })).toBe('quarter');
  });

  it('returns "quarter" for Q4', () => {
    expect(inferPeriodType({ period: { from: date(2025, 10, 1), to: date(2025, 12, 31) } })).toBe('quarter');
  });

  it('returns "month" for a single month', () => {
    expect(inferPeriodType({ period: { from: date(2025, 3, 1), to: date(2025, 3, 31) } })).toBe('month');
  });

  it('returns "month" for February', () => {
    expect(inferPeriodType({ period: { from: date(2025, 2, 1), to: date(2025, 2, 28) } })).toBe('month');
  });

  it('returns "day" for a non-standard range', () => {
    expect(inferPeriodType({ period: { from: date(2025, 1, 5), to: date(2025, 1, 20) } })).toBe('day');
  });

  it('returns "day" for multi-month non-aligned ranges', () => {
    expect(inferPeriodType({ period: { from: date(2025, 1, 1), to: date(2025, 4, 30) } })).toBe('day');
  });

  it('returns "day" for cross-year periods', () => {
    expect(inferPeriodType({ period: { from: date(2024, 1, 1), to: date(2025, 12, 31) } })).toBe('day');
  });
});

describe('formatDateSelectorValue', () => {
  const formatFn = (d: Date, pattern: string) => {
    if (pattern === 'MMM yyyy') {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[d.getMonth()]} ${d.getFullYear()}`;
    }
    return '';
  };
  const translateFn = (key: string) => {
    const map: Record<string, string> = {
      'common.dateSelector.filterModes.before': 'Before',
      'common.dateSelector.filterModes.after': 'After',
    };
    return map[key] || key;
  };

  it('returns empty string when start is null', () => {
    expect(
      formatDateSelectorValue({
        periodType: 'month',
        filterMode: 'is',
        start: null,
        end: null,
        formatFn,
        translateFn,
      }),
    ).toBe('');
  });

  describe('filterMode "is"', () => {
    it('formats month', () => {
      expect(
        formatDateSelectorValue({
          periodType: 'month',
          filterMode: 'is',
          start: { year: 2025, index: 0 },
          end: null,
          formatFn,
          translateFn,
        }),
      ).toBe('Jan 2025');
    });

    it('formats quarter', () => {
      expect(
        formatDateSelectorValue({
          periodType: 'quarter',
          filterMode: 'is',
          start: { year: 2025, index: 2 },
          end: null,
          formatFn,
          translateFn,
        }),
      ).toBe('Q3 2025');
    });

    it('formats half-year', () => {
      expect(
        formatDateSelectorValue({
          periodType: 'half-year',
          filterMode: 'is',
          start: { year: 2025, index: 0 },
          end: null,
          formatFn,
          translateFn,
        }),
      ).toBe('H1 2025');
    });

    it('formats year', () => {
      expect(
        formatDateSelectorValue({
          periodType: 'year',
          filterMode: 'is',
          start: { year: 2025, index: 0 },
          end: null,
          formatFn,
          translateFn,
        }),
      ).toBe('2025');
    });
  });

  it('formats "before" mode', () => {
    expect(
      formatDateSelectorValue({
        periodType: 'month',
        filterMode: 'before',
        start: { year: 2025, index: 5 },
        end: null,
        formatFn,
        translateFn,
      }),
    ).toBe('Before Jun 2025');
  });

  it('formats "after" mode', () => {
    expect(
      formatDateSelectorValue({
        periodType: 'quarter',
        filterMode: 'after',
        start: { year: 2025, index: 0 },
        end: null,
        formatFn,
        translateFn,
      }),
    ).toBe('After Q1 2025');
  });

  it('formats "between" mode with both start and end', () => {
    expect(
      formatDateSelectorValue({
        periodType: 'month',
        filterMode: 'between',
        start: { year: 2025, index: 0 },
        end: { year: 2025, index: 5 },
        formatFn,
        translateFn,
      }),
    ).toBe('Jan 2025 – Jun 2025');
  });

  it('formats "between" mode with only start (no end)', () => {
    expect(
      formatDateSelectorValue({
        periodType: 'month',
        filterMode: 'between',
        start: { year: 2025, index: 0 },
        end: null,
        formatFn,
        translateFn,
      }),
    ).toBe('Jan 2025');
  });

  it('returns empty string for unknown period type in formatCell', () => {
    expect(
      formatDateSelectorValue({
        periodType: 'day',
        filterMode: 'is',
        start: { year: 2025, index: 0 },
        end: null,
        formatFn,
        translateFn,
      }),
    ).toBe('');
  });
});

describe('periodToCellId', () => {
  it('converts month period', () => {
    const result = periodToCellId({
      period: { from: date(2025, 3, 1), to: date(2025, 3, 31) },
      periodType: 'month',
    });
    expect(result.start).toEqual({ year: 2025, index: 2 });
    expect(result.end).toEqual({ year: 2025, index: 2 });
  });

  it('converts quarter period', () => {
    const result = periodToCellId({
      period: { from: date(2025, 4, 1), to: date(2025, 6, 30) },
      periodType: 'quarter',
    });
    expect(result.start).toEqual({ year: 2025, index: 1 });
    expect(result.end).toEqual({ year: 2025, index: 1 });
  });

  it('converts half-year period', () => {
    const result = periodToCellId({
      period: { from: date(2025, 7, 1), to: date(2025, 12, 31) },
      periodType: 'half-year',
    });
    expect(result.start).toEqual({ year: 2025, index: 1 });
    expect(result.end).toEqual({ year: 2025, index: 1 });
  });

  it('converts year period', () => {
    const result = periodToCellId({
      period: { from: date(2025, 1, 1), to: date(2025, 12, 31) },
      periodType: 'year',
    });
    expect(result.start).toEqual({ year: 2025, index: 0 });
    expect(result.end).toEqual({ year: 2025, index: 0 });
  });

  it('handles cross-year range for months', () => {
    const result = periodToCellId({
      period: { from: date(2024, 11, 1), to: date(2025, 2, 28) },
      periodType: 'month',
    });
    expect(result.start).toEqual({ year: 2024, index: 10 });
    expect(result.end).toEqual({ year: 2025, index: 1 });
  });

  it('uses month-based default for unknown period types', () => {
    const result = periodToCellId({
      period: { from: date(2025, 5, 10), to: date(2025, 8, 20) },
      periodType: 'day',
    });
    expect(result.start).toEqual({ year: 2025, index: 4 });
    expect(result.end).toEqual({ year: 2025, index: 7 });
  });
});

describe('inferFilterMode', () => {
  it('returns "between" for day period type', () => {
    expect(
      inferFilterMode({
        period: { from: date(2025, 1, 1), to: date(2025, 1, 31) },
        periodType: 'day',
      }),
    ).toBe('between');
  });

  it('returns "before" when from year is <= 2000', () => {
    expect(
      inferFilterMode({
        period: { from: date(2000, 1, 1), to: date(2025, 3, 31) },
        periodType: 'month',
      }),
    ).toBe('before');
  });

  it('returns "is" when start and end cells match', () => {
    expect(
      inferFilterMode({
        period: { from: date(2025, 3, 1), to: date(2025, 3, 31) },
        periodType: 'month',
      }),
    ).toBe('is');
  });

  it('returns "between" when start and end differ', () => {
    expect(
      inferFilterMode({
        period: { from: date(2025, 1, 1), to: date(2025, 6, 30) },
        periodType: 'month',
      }),
    ).toBe('between');
  });

  it('returns "is" for matching quarter', () => {
    expect(
      inferFilterMode({
        period: { from: date(2025, 1, 1), to: date(2025, 3, 31) },
        periodType: 'quarter',
      }),
    ).toBe('is');
  });

  it('returns "between" for cross-year quarter range', () => {
    expect(
      inferFilterMode({
        period: { from: date(2024, 10, 1), to: date(2025, 3, 31) },
        periodType: 'quarter',
      }),
    ).toBe('between');
  });
});

describe('getGridColumns', () => {
  it('returns 3 for day', () => {
    expect(getGridColumns({ periodType: 'day' })).toBe(3);
  });

  it('returns 3 for month', () => {
    expect(getGridColumns({ periodType: 'month' })).toBe(3);
  });

  it('returns 4 for quarter', () => {
    expect(getGridColumns({ periodType: 'quarter' })).toBe(4);
  });

  it('returns 2 for half-year', () => {
    expect(getGridColumns({ periodType: 'half-year' })).toBe(2);
  });

  it('returns 2 for year', () => {
    expect(getGridColumns({ periodType: 'year' })).toBe(2);
  });
});

describe('getCellLabels', () => {
  const formatFn = (d: Date, pattern: string) => {
    if (pattern === 'MMM') {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return months[d.getMonth()];
    }
    return '';
  };

  it('returns 12 month labels', () => {
    const result = getCellLabels({ periodType: 'month', year: 2025, formatFn });
    expect(result).toHaveLength(12);
    expect(result[0]).toEqual({ label: 'Jan', index: 0 });
    expect(result[11]).toEqual({ label: 'Dec', index: 11 });
  });

  it('returns 4 quarter labels', () => {
    const result = getCellLabels({ periodType: 'quarter', year: 2025, formatFn });
    expect(result).toEqual([
      { label: 'Q1', index: 0 },
      { label: 'Q2', index: 1 },
      { label: 'Q3', index: 2 },
      { label: 'Q4', index: 3 },
    ]);
  });

  it('returns 2 half-year labels', () => {
    const result = getCellLabels({ periodType: 'half-year', year: 2025, formatFn });
    expect(result).toEqual([
      { label: 'H1', index: 0 },
      { label: 'H2', index: 1 },
    ]);
  });

  it('returns empty array for unsupported period types', () => {
    expect(getCellLabels({ periodType: 'year', year: 2025, formatFn })).toEqual([]);
    expect(getCellLabels({ periodType: 'day', year: 2025, formatFn })).toEqual([]);
  });
});

describe('parseDateInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for empty input', () => {
    expect(parseDateInput({ input: '' })).toBeNull();
    expect(parseDateInput({ input: '   ' })).toBeNull();
  });

  describe('year parsing', () => {
    it('parses 4-digit year', () => {
      expect(parseDateInput({ input: '2025' })).toEqual({
        periodType: 'year',
        filterMode: 'is',
        start: { year: 2025, index: 0 },
        end: null,
      });
    });

    it('rejects years outside 1900-2100', () => {
      expect(parseDateInput({ input: '1899' })).toBeNull();
      expect(parseDateInput({ input: '2101' })).toBeNull();
    });

    it('accepts boundary years', () => {
      expect(parseDateInput({ input: '1900' })).not.toBeNull();
      expect(parseDateInput({ input: '2100' })).not.toBeNull();
    });
  });

  describe('quarter parsing', () => {
    it('parses "Q1" with default current year', () => {
      expect(parseDateInput({ input: 'Q1' })).toEqual({
        periodType: 'quarter',
        filterMode: 'is',
        start: { year: 2025, index: 0 },
        end: null,
      });
    });

    it('parses "Q4 2024" with explicit year', () => {
      expect(parseDateInput({ input: 'Q4 2024' })).toEqual({
        periodType: 'quarter',
        filterMode: 'is',
        start: { year: 2024, index: 3 },
        end: null,
      });
    });

    it('is case-insensitive', () => {
      expect(parseDateInput({ input: 'q2' })).toEqual({
        periodType: 'quarter',
        filterMode: 'is',
        start: { year: 2025, index: 1 },
        end: null,
      });
    });
  });

  describe('half-year parsing', () => {
    it('parses "H1" with default current year', () => {
      expect(parseDateInput({ input: 'H1' })).toEqual({
        periodType: 'half-year',
        filterMode: 'is',
        start: { year: 2025, index: 0 },
        end: null,
      });
    });

    it('parses "H2 2024"', () => {
      expect(parseDateInput({ input: 'H2 2024' })).toEqual({
        periodType: 'half-year',
        filterMode: 'is',
        start: { year: 2024, index: 1 },
        end: null,
      });
    });

    it('is case-insensitive', () => {
      expect(parseDateInput({ input: 'h1' })).not.toBeNull();
    });
  });

  describe('month name parsing', () => {
    it('parses full month name', () => {
      expect(parseDateInput({ input: 'January' })).toEqual({
        periodType: 'month',
        filterMode: 'is',
        start: { year: 2025, index: 0 },
        end: null,
      });
    });

    it('parses abbreviated month name', () => {
      expect(parseDateInput({ input: 'Mar' })).toEqual({
        periodType: 'month',
        filterMode: 'is',
        start: { year: 2025, index: 2 },
        end: null,
      });
    });

    it('parses month name with year', () => {
      expect(parseDateInput({ input: 'Dec 2024' })).toEqual({
        periodType: 'month',
        filterMode: 'is',
        start: { year: 2024, index: 11 },
        end: null,
      });
    });

    it('is case-insensitive', () => {
      expect(parseDateInput({ input: 'FEBRUARY' })).toEqual({
        periodType: 'month',
        filterMode: 'is',
        start: { year: 2025, index: 1 },
        end: null,
      });
    });

    it('returns null for invalid month names', () => {
      expect(parseDateInput({ input: 'Foo' })).toBeNull();
    });
  });

  describe('month/year numeric parsing', () => {
    it('parses "01/2025"', () => {
      expect(parseDateInput({ input: '01/2025' })).toEqual({
        periodType: 'month',
        filterMode: 'is',
        start: { year: 2025, index: 0 },
        end: null,
      });
    });

    it('parses "6/2025" (without leading zero)', () => {
      expect(parseDateInput({ input: '6/2025' })).toEqual({
        periodType: 'month',
        filterMode: 'is',
        start: { year: 2025, index: 5 },
        end: null,
      });
    });

    it('parses "12/2025"', () => {
      expect(parseDateInput({ input: '12/2025' })).toEqual({
        periodType: 'month',
        filterMode: 'is',
        start: { year: 2025, index: 11 },
        end: null,
      });
    });

    it('rejects invalid month numbers', () => {
      expect(parseDateInput({ input: '13/2025' })).toBeNull();
      expect(parseDateInput({ input: '0/2025' })).toBeNull();
    });
  });

  describe('full date parsing', () => {
    it('parses dd/MM/yyyy format', () => {
      const result = parseDateInput({ input: '10/05/2025' });
      expect(result).not.toBeNull();
      expect(result!.periodType).toBe('day');
      expect(result!.filterMode).toBe('is');
      expect(result!.dayStart!.getFullYear()).toBe(2025);
      expect(result!.dayStart!.getMonth()).toBe(4); // May
      expect(result!.dayStart!.getDate()).toBe(10);
    });

    it('parses yyyy-MM-dd format', () => {
      const result = parseDateInput({ input: '2025-05-10' });
      expect(result).not.toBeNull();
      expect(result!.periodType).toBe('day');
      expect(result!.dayStart!.getMonth()).toBe(4);
      expect(result!.dayStart!.getDate()).toBe(10);
    });

    it('parses dd.MM.yyyy format', () => {
      const result = parseDateInput({ input: '10.05.2025' });
      expect(result).not.toBeNull();
      expect(result!.periodType).toBe('day');
      expect(result!.dayStart!.getMonth()).toBe(4);
      expect(result!.dayStart!.getDate()).toBe(10);
    });

    it('rejects dates outside valid year range', () => {
      expect(parseDateInput({ input: '01/01/1800' })).toBeNull();
    });
  });

  it('returns null for unrecognized input', () => {
    expect(parseDateInput({ input: 'hello world' })).toBeNull();
    expect(parseDateInput({ input: '!!!' })).toBeNull();
  });
});
