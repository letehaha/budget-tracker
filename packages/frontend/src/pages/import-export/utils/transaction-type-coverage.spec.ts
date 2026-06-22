import { describe, expect, it } from 'vitest';

import { distinctColumnValues, findUncoveredValues } from './transaction-type-coverage';

describe('distinctColumnValues', () => {
  const headers = ['date', 'amount', 'type'];
  const dataRows = [
    ['2026-01-01', '100', 'Gasto'],
    ['2026-01-02', '200', 'Ingreso'],
    ['2026-01-03', '300', 'Gasto'],
    ['2026-01-04', '400', 'Expense'],
  ];

  it('returns distinct values in first-seen order', () => {
    expect(distinctColumnValues({ headers, dataRows, columnName: 'type' })).toEqual(['Gasto', 'Ingreso', 'Expense']);
  });

  it('trims values and ignores empty cells', () => {
    expect(
      distinctColumnValues({
        headers,
        dataRows: [
          ['2026-01-01', '100', '  Gasto '],
          ['2026-01-02', '200', ''],
          ['2026-01-03', '300', 'Gasto'],
        ],
        columnName: 'type',
      }),
    ).toEqual(['Gasto']);
  });

  it('returns an empty array when the column is not present', () => {
    expect(distinctColumnValues({ headers, dataRows, columnName: 'missing' })).toEqual([]);
  });
});

describe('findUncoveredValues', () => {
  it('returns values absent from both lists', () => {
    expect(
      findUncoveredValues({
        values: ['Gasto', 'Ingreso', 'Expense', 'Income'],
        incomeValues: ['Ingreso', 'Income'],
        expenseValues: ['Gasto'],
      }),
    ).toEqual(['Expense']);
  });

  it('returns empty when every value is covered', () => {
    expect(
      findUncoveredValues({
        values: ['Gasto', 'Ingreso'],
        incomeValues: ['Ingreso'],
        expenseValues: ['Gasto'],
      }),
    ).toEqual([]);
  });

  it('is case-sensitive, mirroring the backend', () => {
    expect(
      findUncoveredValues({
        values: ['gasto'],
        incomeValues: [],
        expenseValues: ['Gasto'],
      }),
    ).toEqual(['gasto']);
  });
});
