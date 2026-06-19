import {
  AccountOptionValue,
  CategoryOptionValue,
  CurrencyOptionValue,
  TransactionTypeOptionValue,
} from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { isAccountDecided, isCategoryDecided, isCurrencyDecided, isTransactionTypeDecided } from './field-decision';

// ---------------------------------------------------------------------------
// isCategoryDecided
// ---------------------------------------------------------------------------

describe('isCategoryDecided', () => {
  it('returns false when category is null', () => {
    expect(isCategoryDecided({ category: null })).toBe(false);
  });

  it('returns true for existingCategory with a categoryId', () => {
    expect(
      isCategoryDecided({
        category: { option: CategoryOptionValue.existingCategory, categoryId: 'cat-1' },
      }),
    ).toBe(true);
  });

  it('returns false for existingCategory when categoryId is empty string', () => {
    expect(
      isCategoryDecided({
        category: { option: CategoryOptionValue.existingCategory, categoryId: '' },
      }),
    ).toBe(false);
  });

  it('returns true for mapDataSourceColumn with a columnName', () => {
    expect(
      isCategoryDecided({
        category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Category' },
      }),
    ).toBe(true);
  });

  it('returns false for mapDataSourceColumn when columnName is empty string', () => {
    expect(
      isCategoryDecided({
        category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: '' },
      }),
    ).toBe(false);
  });

  it('returns true for createNewCategories with a columnName', () => {
    expect(
      isCategoryDecided({
        category: { option: CategoryOptionValue.createNewCategories, columnName: 'Category' },
      }),
    ).toBe(true);
  });

  it('returns false for createNewCategories when columnName is empty string', () => {
    expect(
      isCategoryDecided({
        category: { option: CategoryOptionValue.createNewCategories, columnName: '' },
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isAccountDecided
// ---------------------------------------------------------------------------

describe('isAccountDecided', () => {
  it('returns false when account is null', () => {
    expect(isAccountDecided({ account: null })).toBe(false);
  });

  it('returns true for existingAccount with an accountId', () => {
    expect(
      isAccountDecided({
        account: { option: AccountOptionValue.existingAccount, accountId: 'acc-1' },
      }),
    ).toBe(true);
  });

  it('returns false for existingAccount when accountId is empty string', () => {
    expect(
      isAccountDecided({
        account: { option: AccountOptionValue.existingAccount, accountId: '' },
      }),
    ).toBe(false);
  });

  it('returns true for dataSourceColumn with a columnName', () => {
    expect(
      isAccountDecided({
        account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
      }),
    ).toBe(true);
  });

  it('returns false for dataSourceColumn when columnName is empty string', () => {
    expect(
      isAccountDecided({
        account: { option: AccountOptionValue.dataSourceColumn, columnName: '' },
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isCurrencyDecided
// ---------------------------------------------------------------------------

describe('isCurrencyDecided', () => {
  it('returns false when currency is null', () => {
    expect(isCurrencyDecided({ currency: null })).toBe(false);
  });

  it('returns true for existingCurrency with a currencyCode', () => {
    expect(
      isCurrencyDecided({
        currency: { option: CurrencyOptionValue.existingCurrency, currencyCode: 'USD' },
      }),
    ).toBe(true);
  });

  it('returns false for existingCurrency when currencyCode is empty string', () => {
    expect(
      isCurrencyDecided({
        currency: { option: CurrencyOptionValue.existingCurrency, currencyCode: '' },
      }),
    ).toBe(false);
  });

  it('returns true for dataSourceColumn with a columnName', () => {
    expect(
      isCurrencyDecided({
        currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
      }),
    ).toBe(true);
  });

  it('returns false for dataSourceColumn when columnName is empty string', () => {
    expect(
      isCurrencyDecided({
        currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: '' },
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isTransactionTypeDecided
// ---------------------------------------------------------------------------

describe('isTransactionTypeDecided', () => {
  it('always returns true for amountSign (needs no further decision)', () => {
    expect(
      isTransactionTypeDecided({
        transactionType: { option: TransactionTypeOptionValue.amountSign },
      }),
    ).toBe(true);
  });

  it('returns true for dataSourceColumn when columnName and both value lists are present', () => {
    expect(
      isTransactionTypeDecided({
        transactionType: {
          option: TransactionTypeOptionValue.dataSourceColumn,
          columnName: 'Type',
          incomeValues: ['credit'],
          expenseValues: ['debit'],
        },
      }),
    ).toBe(true);
  });

  it('returns false for dataSourceColumn when columnName is empty string', () => {
    expect(
      isTransactionTypeDecided({
        transactionType: {
          option: TransactionTypeOptionValue.dataSourceColumn,
          columnName: '',
          incomeValues: ['credit'],
          expenseValues: ['debit'],
        },
      }),
    ).toBe(false);
  });

  it('returns false for dataSourceColumn when incomeValues is empty', () => {
    expect(
      isTransactionTypeDecided({
        transactionType: {
          option: TransactionTypeOptionValue.dataSourceColumn,
          columnName: 'Type',
          incomeValues: [],
          expenseValues: ['debit'],
        },
      }),
    ).toBe(false);
  });

  it('returns false for dataSourceColumn when expenseValues is empty', () => {
    expect(
      isTransactionTypeDecided({
        transactionType: {
          option: TransactionTypeOptionValue.dataSourceColumn,
          columnName: 'Type',
          incomeValues: ['credit'],
          expenseValues: [],
        },
      }),
    ).toBe(false);
  });

  it('returns false for dataSourceColumn when columnName missing AND both value lists empty', () => {
    expect(
      isTransactionTypeDecided({
        transactionType: {
          option: TransactionTypeOptionValue.dataSourceColumn,
          columnName: '',
          incomeValues: [],
          expenseValues: [],
        },
      }),
    ).toBe(false);
  });

  it('returns false for dataSourceColumn when only columnName is set (both lists empty)', () => {
    expect(
      isTransactionTypeDecided({
        transactionType: {
          option: TransactionTypeOptionValue.dataSourceColumn,
          columnName: 'Type',
          incomeValues: [],
          expenseValues: [],
        },
      }),
    ).toBe(false);
  });

  it('accepts multiple income and expense values', () => {
    expect(
      isTransactionTypeDecided({
        transactionType: {
          option: TransactionTypeOptionValue.dataSourceColumn,
          columnName: 'Direction',
          incomeValues: ['credit', 'deposit', 'Credit'],
          expenseValues: ['debit', 'withdrawal'],
        },
      }),
    ).toBe(true);
  });
});
