import type { Cents, DuplicateMatch } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import {
  buildComparisonRows,
  formatDuplicateAmount,
  formatDuplicateDate,
  sideComparisonFields,
} from './duplicate-comparison';

/** Builds a DuplicateMatch, overriding only the imported/existing fields a test cares about. */
const makeMatch = (
  imported: Partial<DuplicateMatch['importedTransaction']> = {},
  existing: Partial<DuplicateMatch['existingTransaction']> = {},
): DuplicateMatch => ({
  rowIndex: 2,
  matchType: 'exact',
  confidence: 100,
  importedTransaction: {
    rowIndex: 2,
    date: '2026-06-16',
    amount: 25000 as Cents,
    description: 'Clips BYD',
    accountName: 'Checking',
    currencyCode: 'USD',
    transactionType: 'expense',
    ...imported,
  },
  existingTransaction: {
    id: 'tx-1',
    date: '2026-06-16',
    amount: 25000 as Cents,
    note: 'Clips BYD',
    accountId: 'acc-1',
    ...existing,
  },
});

describe('formatDuplicateAmount', () => {
  it('converts integer cents to a 2-decimal string', () => {
    expect(formatDuplicateAmount(25000)).toBe('250.00');
    expect(formatDuplicateAmount(88256)).toBe('882.56');
    expect(formatDuplicateAmount(0)).toBe('0.00');
  });
});

describe('formatDuplicateDate', () => {
  it('formats a date-only ISO string as dd MMM yyyy', () => {
    expect(formatDuplicateDate('2026-06-16')).toBe('16 Jun 2026');
  });

  it('returns the raw input for an empty string without throwing', () => {
    expect(formatDuplicateDate('')).toBe('');
  });

  it('returns the raw input for a malformed string without throwing', () => {
    expect(formatDuplicateDate('not-a-date')).toBe('not-a-date');
  });
});

describe('buildComparisonRows', () => {
  it('always includes amount and date for both sides, amount emphasised', () => {
    const rows = buildComparisonRows(makeMatch());

    const amount = rows.find((row) => row.key === 'amount');
    expect(amount).toEqual({ key: 'amount', csv: '250.00', existing: '250.00', emphasis: true });

    const date = rows.find((row) => row.key === 'date');
    expect(date).toEqual({ key: 'date', csv: '16 Jun 2026', existing: '16 Jun 2026' });
    expect(date?.emphasis).toBeUndefined();
  });

  it('keeps the note row when only one side has a value, nulling the empty side', () => {
    const rows = buildComparisonRows(makeMatch({ description: 'Coffee' }, { note: '' }));
    const note = rows.find((row) => row.key === 'note');
    expect(note).toEqual({ key: 'note', csv: 'Coffee', existing: null });
  });

  it('drops the note row when neither side has a value', () => {
    const rows = buildComparisonRows(makeMatch({ description: '' }, { note: '' }));
    expect(rows.some((row) => row.key === 'note')).toBe(false);
  });

  it('includes a CSV-only category row (existing transactions never carry one)', () => {
    const rows = buildComparisonRows(makeMatch({ categoryName: 'Groceries' }));
    const category = rows.find((row) => row.key === 'category');
    expect(category).toEqual({ key: 'category', csv: 'Groceries', existing: null });
  });

  it('drops the category row when the CSV row has no category', () => {
    const rows = buildComparisonRows(makeMatch({ categoryName: undefined }));
    expect(rows.some((row) => row.key === 'category')).toBe(false);
  });

  it('preserves display order: amount, date, note, category', () => {
    const rows = buildComparisonRows(makeMatch({ description: 'Coffee', categoryName: 'Food' }));
    expect(rows.map((row) => row.key)).toEqual(['amount', 'date', 'note', 'category']);
  });
});

describe('sideComparisonFields', () => {
  it('omits fields absent on the requested side', () => {
    const match = makeMatch({ categoryName: 'Food' }, { note: '' });

    // Existing side: no category (never present) and no note (empty here).
    const existing = sideComparisonFields(match, 'existing');
    expect(existing.map((row) => row.key)).toEqual(['amount', 'date']);

    // CSV side: has note + category.
    const csv = sideComparisonFields(match, 'csv');
    expect(csv.map((row) => row.key)).toEqual(['amount', 'date', 'note', 'category']);
  });
});
