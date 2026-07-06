import { type ColumnMappingConfig, TagOptionValue } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';

import { extractTags } from './extract-tags';

const baseMapping: ColumnMappingConfig = {
  date: 'Date',
  dateFieldOrder: 'month-first',
  amount: 'Amount',
  category: { option: 'map-data-source-column', columnName: 'Category' } as ColumnMappingConfig['category'],
  currency: { option: 'data-source-column', columnName: 'Currency' } as ColumnMappingConfig['currency'],
  transactionType: { option: 'amount-sign' } as ColumnMappingConfig['transactionType'],
  account: { option: 'data-source-column', columnName: 'Account' } as ColumnMappingConfig['account'],
};

describe('extractTags', () => {
  it('returns the distinct, sorted tag strings across all rows', () => {
    const headers = ['Labels'];
    const dataRows = [['travel'], ['food'], ['travel']];

    const result = extractTags({
      headers,
      dataRows,
      columnMapping: { ...baseMapping, tags: { option: TagOptionValue.mapDataSourceColumn, columnName: 'Labels' } },
    });

    expect(result).toEqual(['food', 'travel']);
  });

  it('comma-splits each cell so multi-tag cells contribute every distinct name', () => {
    const headers = ['Labels'];
    const dataRows = [['food, travel'], ['food, gift']];

    const result = extractTags({
      headers,
      dataRows,
      columnMapping: { ...baseMapping, tags: { option: TagOptionValue.mapDataSourceColumn, columnName: 'Labels' } },
    });

    expect(result).toEqual(['food', 'gift', 'travel']);
  });

  it('returns an empty array when no tag column is mapped', () => {
    const headers = ['Labels'];
    const dataRows = [['food']];

    expect(extractTags({ headers, dataRows, columnMapping: baseMapping })).toEqual([]);
    expect(extractTags({ headers, dataRows, columnMapping: { ...baseMapping, tags: null } })).toEqual([]);
  });

  it('throws when the mapped tag column is not present in the headers', () => {
    const headers = ['Date'];
    const dataRows = [['food']];

    expect(() =>
      extractTags({
        headers,
        dataRows,
        columnMapping: { ...baseMapping, tags: { option: TagOptionValue.mapDataSourceColumn, columnName: 'Labels' } },
      }),
    ).toThrow();
  });
});
