import { type Period } from '@/composable/use-period-navigation';
import {
  endOfMonth,
  endOfQuarter,
  endOfYear,
  isFirstDayOfMonth,
  isLastDayOfMonth,
  isValid,
  parse,
  startOfMonth,
  startOfQuarter,
  startOfYear,
} from 'date-fns';

import { type CellId, type DateSelectorFilterMode, type DateSelectorPeriodType } from './types';

/** Get start and end dates for a given period cell */
export function getPeriodBoundaries({
  periodType,
  year,
  index,
}: {
  periodType: DateSelectorPeriodType;
  year: number;
  index: number;
}): { start: Date; end: Date } {
  switch (periodType) {
    case 'month': {
      const date = new Date(year, index, 1);
      return { start: startOfMonth(date), end: endOfMonth(date) };
    }
    case 'quarter': {
      // index 0 = Q1 (Jan), 1 = Q2 (Apr), 2 = Q3 (Jul), 3 = Q4 (Oct)
      const date = new Date(year, index * 3, 1);
      return { start: startOfQuarter(date), end: endOfQuarter(date) };
    }
    case 'half-year': {
      // index 0 = H1 (Jan-Jun), 1 = H2 (Jul-Dec)
      const start = new Date(year, index * 6, 1);
      const end = endOfMonth(new Date(year, index * 6 + 5, 1));
      return { start, end };
    }
    case 'year': {
      const date = new Date(year, 0, 1);
      return { start: startOfYear(date), end: endOfYear(date) };
    }
    default:
      return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
  }
}

/** Convert a cell to a linear index for range comparison */
export function cellToLinearIndex({
  periodType,
  year,
  index,
}: {
  periodType: DateSelectorPeriodType;
  year: number;
  index: number;
}): number {
  switch (periodType) {
    case 'month':
      return year * 12 + index;
    case 'quarter':
      return year * 4 + index;
    case 'half-year':
      return year * 2 + index;
    case 'year':
      return year;
    default:
      return 0;
  }
}

/** Check if a cell represents a future period */
export function isFutureCell({
  periodType,
  year,
  index,
}: {
  periodType: DateSelectorPeriodType;
  year: number;
  index: number;
}): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  switch (periodType) {
    case 'month':
      return year > currentYear || (year === currentYear && index > currentMonth);
    case 'quarter':
      return year > currentYear || (year === currentYear && index > Math.floor(currentMonth / 3));
    case 'half-year':
      return year > currentYear || (year === currentYear && index > Math.floor(currentMonth / 6));
    case 'year':
      return year > currentYear;
    default:
      return false;
  }
}

/** Infer the period type from a given period */
export function inferPeriodType({ period }: { period: Period }): DateSelectorPeriodType {
  const { from, to } = period;

  // Check if it's a full year
  if (
    from.getMonth() === 0 &&
    from.getDate() === 1 &&
    to.getMonth() === 11 &&
    to.getDate() === 31 &&
    from.getFullYear() === to.getFullYear()
  ) {
    return 'year';
  }

  // Check if it's a half-year (Jan-Jun or Jul-Dec)
  if (isFirstDayOfMonth(from) && isLastDayOfMonth(to) && from.getFullYear() === to.getFullYear()) {
    const startMonth = from.getMonth();
    const endMonth = to.getMonth();

    if ((startMonth === 0 && endMonth === 5) || (startMonth === 6 && endMonth === 11)) {
      return 'half-year';
    }

    // Check if it's a quarter
    if (endMonth - startMonth === 2 && startMonth % 3 === 0) {
      return 'quarter';
    }

    // Check if it's a single month
    if (startMonth === endMonth) {
      return 'month';
    }
  }

  return 'day';
}

/** Format the display text for the date selector */
export function formatDateSelectorValue({
  periodType,
  filterMode,
  start,
  end,
  formatFn,
  translateFn,
}: {
  periodType: DateSelectorPeriodType;
  filterMode: DateSelectorFilterMode;
  start: CellId | null;
  end: CellId | null;
  formatFn: (date: Date, pattern: string) => string;
  translateFn: (key: string) => string;
}): string {
  if (!start) return '';

  const formatCell = (cell: CellId): string => {
    switch (periodType) {
      case 'month':
        return formatFn(new Date(cell.year, cell.index, 1), 'MMM yyyy');
      case 'quarter':
        return `Q${cell.index + 1} ${cell.year}`;
      case 'half-year':
        return `H${cell.index + 1} ${cell.year}`;
      case 'year':
        return `${cell.year}`;
      default:
        return '';
    }
  };

  switch (filterMode) {
    case 'is':
      return formatCell(start);
    case 'before':
      return `${translateFn('common.dateSelector.filterModes.before')} ${formatCell(start)}`;
    case 'after':
      return `${translateFn('common.dateSelector.filterModes.after')} ${formatCell(start)}`;
    case 'between':
      if (!end) return formatCell(start);
      return `${formatCell(start)} – ${formatCell(end)}`;
    default:
      return '';
  }
}

/** Extract CellId from a Period based on the period type */
export function periodToCellId({ period, periodType }: { period: Period; periodType: DateSelectorPeriodType }): {
  start: CellId;
  end: CellId;
} {
  const from = period.from;
  const to = period.to;

  switch (periodType) {
    case 'quarter':
      return {
        start: { year: from.getFullYear(), index: Math.floor(from.getMonth() / 3) },
        end: { year: to.getFullYear(), index: Math.floor(to.getMonth() / 3) },
      };
    case 'half-year':
      return {
        start: { year: from.getFullYear(), index: Math.floor(from.getMonth() / 6) },
        end: { year: to.getFullYear(), index: Math.floor(to.getMonth() / 6) },
      };
    case 'year':
      return {
        start: { year: from.getFullYear(), index: 0 },
        end: { year: to.getFullYear(), index: 0 },
      };
    default:
      return {
        start: { year: from.getFullYear(), index: from.getMonth() },
        end: { year: to.getFullYear(), index: to.getMonth() },
      };
  }
}

/** Infer the filter mode from a Period */
export function inferFilterMode({
  period,
  periodType,
}: {
  period: Period;
  periodType: DateSelectorPeriodType;
}): DateSelectorFilterMode {
  if (periodType === 'day') return 'between';

  const { start: startCell, end: endCell } = periodToCellId({ period, periodType });

  if (period.from.getFullYear() <= 2000) return 'before';

  if (startCell.year === endCell.year && startCell.index === endCell.index) {
    return 'is';
  }

  return 'between';
}

const GRID_COLUMNS: Record<DateSelectorPeriodType, number> = {
  day: 3,
  month: 3,
  quarter: 4,
  'half-year': 2,
  year: 2,
};

/** Get grid columns for a period type */
export function getGridColumns({ periodType }: { periodType: DateSelectorPeriodType }): number {
  return GRID_COLUMNS[periodType];
}

/** Get cell labels for a period type and year */
export function getCellLabels({
  periodType,
  year,
  formatFn,
}: {
  periodType: DateSelectorPeriodType;
  year: number;
  formatFn: (date: Date, pattern: string) => string;
}): { label: string; index: number }[] {
  switch (periodType) {
    case 'month':
      return Array.from({ length: 12 }, (_, i) => ({
        label: formatFn(new Date(year, i, 1), 'MMM'),
        index: i,
      }));
    case 'quarter':
      return [
        { label: 'Q1', index: 0 },
        { label: 'Q2', index: 1 },
        { label: 'Q3', index: 2 },
        { label: 'Q4', index: 3 },
      ];
    case 'half-year':
      return [
        { label: 'H1', index: 0 },
        { label: 'H2', index: 1 },
      ];
    default:
      return [];
  }
}

export interface ParsedDateInput {
  periodType: DateSelectorPeriodType;
  filterMode: DateSelectorFilterMode;
  start: CellId;
  end: CellId | null;
  /** For day-level parsing */
  dayStart?: Date;
  dayEnd?: Date;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

/** Parse user text input into a date selector state */
export function parseDateInput({ input }: { input: string }): ParsedDateInput | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const currentYear = new Date().getFullYear();

  // "2025" — year
  if (/^\d{4}$/.test(trimmed)) {
    const year = parseInt(trimmed, 10);
    if (year >= 1900 && year <= 2100) {
      return { periodType: 'year', filterMode: 'is', start: { year, index: 0 }, end: null };
    }
  }

  // "Q1" or "Q4 2025"
  const quarterMatch = trimmed.match(/^Q([1-4])(?:\s+(\d{4}))?$/i);
  if (quarterMatch) {
    const qIndex = parseInt(quarterMatch[1], 10) - 1;
    const year = quarterMatch[2] ? parseInt(quarterMatch[2], 10) : currentYear;
    return { periodType: 'quarter', filterMode: 'is', start: { year, index: qIndex }, end: null };
  }

  // "H1" or "H2 2025"
  const halfMatch = trimmed.match(/^H([12])(?:\s+(\d{4}))?$/i);
  if (halfMatch) {
    const hIndex = parseInt(halfMatch[1], 10) - 1;
    const year = halfMatch[2] ? parseInt(halfMatch[2], 10) : currentYear;
    return { periodType: 'half-year', filterMode: 'is', start: { year, index: hIndex }, end: null };
  }

  // "Jan 2025" or "January 2025" or "Jan" — month
  const monthYearMatch = trimmed.match(/^([a-zA-Z]+)(?:\s+(\d{4}))?$/);
  if (monthYearMatch) {
    const monthName = monthYearMatch[1].toLowerCase();
    const monthIndex = MONTH_NAMES[monthName];
    if (monthIndex !== undefined) {
      const year = monthYearMatch[2] ? parseInt(monthYearMatch[2], 10) : currentYear;
      return { periodType: 'month', filterMode: 'is', start: { year, index: monthIndex }, end: null };
    }
  }

  // "01/2025" or "1/2025" — month/year
  const monthSlashYear = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (monthSlashYear) {
    const month = parseInt(monthSlashYear[1], 10) - 1;
    const year = parseInt(monthSlashYear[2], 10);
    if (month >= 0 && month <= 11) {
      return { periodType: 'month', filterMode: 'is', start: { year, index: month }, end: null };
    }
  }

  // Date formats: "10/05/2025", "2025-05-10", "10.05.2025"
  const dateFormats = ['dd/MM/yyyy', 'yyyy-MM-dd', 'dd.MM.yyyy'];
  for (const fmt of dateFormats) {
    const parsed = parse(trimmed, fmt, new Date());
    if (isValid(parsed) && parsed.getFullYear() >= 1900 && parsed.getFullYear() <= 2100) {
      return {
        periodType: 'day',
        filterMode: 'is',
        start: { year: parsed.getFullYear(), index: parsed.getMonth() },
        end: null,
        dayStart: parsed,
        dayEnd: parsed,
      };
    }
  }

  return null;
}
