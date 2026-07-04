import {
  AccountOptionValue,
  CategoryOptionValue,
  CurrencyOptionValue,
  TransactionTypeOptionValue,
} from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import type { ColumnMatch, ColumnMatchResult } from './auto-match';
import { buildInitialColumnMapping } from './build-initial-mapping';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const match = (column: string): ColumnMatch => ({ column, confidence: 'exact' });

/** A fully-unmatched result (every field null) to start from / spread over. */
const emptyMatch: ColumnMatchResult = {
  date: null,
  amount: null,
  description: null,
  category: null,
  account: null,
  currency: null,
  payee: null,
  tags: null,
  transactionType: null,
};

// ---------------------------------------------------------------------------
// matched-all case
// ---------------------------------------------------------------------------

describe('buildInitialColumnMapping — all columns matched', () => {
  const matchResult: ColumnMatchResult = {
    date: match('Date'),
    amount: match('Amount'),
    description: match('Memo'),
    category: match('Category'),
    account: match('Account'),
    currency: match('Currency'),
    payee: match('Payee'),
    tags: match('Labels'),
    transactionType: match('Type'),
  };

  const preview = [
    { Date: '2026-01-01', Amount: '10', Memo: 'a', Category: 'Food', Account: 'BBVA', Currency: 'USD', Type: 'credit' },
  ];

  const result = buildInitialColumnMapping({ matchResult, preview });

  it('maps simple fields to their matched column names', () => {
    expect(result.date).toBe('Date');
    expect(result.amount).toBe('Amount');
    expect(result.description).toBe('Memo');
    expect(result.payee).toBe('Payee');
  });

  it('sets category to map-data-source-column with the matched column', () => {
    expect(result.category).toEqual({
      option: CategoryOptionValue.mapDataSourceColumn,
      columnName: 'Category',
    });
  });

  it('sets account to data-source-column with the matched column', () => {
    expect(result.account).toEqual({
      option: AccountOptionValue.dataSourceColumn,
      columnName: 'Account',
    });
  });

  it('sets currency to data-source-column with the matched column', () => {
    expect(result.currency).toEqual({
      option: CurrencyOptionValue.dataSourceColumn,
      columnName: 'Currency',
    });
  });

  it('sets transactionType to data-source-column with the matched column', () => {
    expect(result.transactionType).toMatchObject({
      option: TransactionTypeOptionValue.dataSourceColumn,
      columnName: 'Type',
    });
  });

  it('leaves tags unset even when a tags column matched (opt-in only)', () => {
    expect(result.tags).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// no-match case
// ---------------------------------------------------------------------------

describe('buildInitialColumnMapping — no columns matched', () => {
  const result = buildInitialColumnMapping({ matchResult: emptyMatch, preview: [] });

  it('leaves simple fields null', () => {
    expect(result.date).toBeNull();
    expect(result.amount).toBeNull();
    expect(result.description).toBeNull();
    expect(result.payee).toBeNull();
  });

  it('leaves category / account / currency unset (needs-attention)', () => {
    expect(result.category).toBeNull();
    expect(result.account).toBeNull();
    expect(result.currency).toBeNull();
  });

  it('leaves tags null', () => {
    expect(result.tags).toBeNull();
  });

  it('defaults transactionType to amount-sign', () => {
    expect(result.transactionType).toEqual({ option: TransactionTypeOptionValue.amountSign });
  });
});

// ---------------------------------------------------------------------------
// transaction-type classification from preview
// ---------------------------------------------------------------------------

describe('buildInitialColumnMapping — transaction-type value classification', () => {
  it('pre-fills income/expense values from distinct preview values of the type column', () => {
    const matchResult: ColumnMatchResult = { ...emptyMatch, transactionType: match('Direction') };
    const preview = [
      { Direction: 'Credit' },
      { Direction: 'Debit' },
      { Direction: 'credit' }, // duplicate after normalisation of distinct check (raw differs)
      { Direction: 'Deposit' },
      { Direction: 'Mystery' }, // unknown — must land in neither bucket
    ];

    const result = buildInitialColumnMapping({ matchResult, preview });

    expect(result.transactionType).toEqual({
      option: TransactionTypeOptionValue.dataSourceColumn,
      columnName: 'Direction',
      // 'Credit', 'credit' and 'Deposit' are all income synonyms; raw values preserved.
      incomeValues: ['Credit', 'credit', 'Deposit'],
      expenseValues: ['Debit'],
    });
  });

  it('ignores empty cells when collecting distinct type values', () => {
    const matchResult: ColumnMatchResult = { ...emptyMatch, transactionType: match('Type') };
    const preview = [{ Type: 'credit' }, { Type: '' }, { Type: 'debit' }];

    const result = buildInitialColumnMapping({ matchResult, preview });

    expect(result.transactionType).toEqual({
      option: TransactionTypeOptionValue.dataSourceColumn,
      columnName: 'Type',
      incomeValues: ['credit'],
      expenseValues: ['debit'],
    });
  });

  it('yields empty income/expense arrays when no distinct value is a known synonym', () => {
    const matchResult: ColumnMatchResult = { ...emptyMatch, transactionType: match('Type') };
    const preview = [{ Type: 'foo' }, { Type: 'bar' }];

    const result = buildInitialColumnMapping({ matchResult, preview });

    expect(result.transactionType).toEqual({
      option: TransactionTypeOptionValue.dataSourceColumn,
      columnName: 'Type',
      incomeValues: [],
      expenseValues: [],
    });
  });
});
