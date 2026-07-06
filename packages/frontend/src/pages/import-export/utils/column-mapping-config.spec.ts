import {
  type AccountOption,
  AccountOptionValue,
  type CategoryOption,
  CategoryOptionValue,
  type CurrencyOption,
  CurrencyOptionValue,
  type TagOption,
  TagOptionValue,
  TransactionTypeOptionValue,
} from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import type { ColumnMapping } from './build-initial-mapping';
import { toColumnMappingConfig } from './column-mapping-config';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** A fully-valid ColumnMapping with every required field set. */
const baseMapping: ColumnMapping = {
  date: 'Date',
  dateFieldOrder: 'month-first',
  amount: 'Amount',
  description: 'Memo',
  payee: null,
  category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Category' },
  tags: null,
  account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
  currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
  transactionType: { option: TransactionTypeOptionValue.amountSign },
};

// ---------------------------------------------------------------------------
// null when any required field is missing
// ---------------------------------------------------------------------------

describe('toColumnMappingConfig — returns null when required field is missing', () => {
  it('returns null when date is null', () => {
    const result = toColumnMappingConfig({ mapping: { ...baseMapping, date: null } });
    expect(result).toBeNull();
  });

  it('returns null when dateFieldOrder is unconfirmed', () => {
    const result = toColumnMappingConfig({ mapping: { ...baseMapping, dateFieldOrder: null } });
    expect(result).toBeNull();
  });

  it('returns null when amount is null', () => {
    const result = toColumnMappingConfig({ mapping: { ...baseMapping, amount: null } });
    expect(result).toBeNull();
  });

  it('returns null when category is null', () => {
    const result = toColumnMappingConfig({ mapping: { ...baseMapping, category: null } });
    expect(result).toBeNull();
  });

  it('returns null when account is null', () => {
    const result = toColumnMappingConfig({ mapping: { ...baseMapping, account: null } });
    expect(result).toBeNull();
  });

  it('returns null when currency is null', () => {
    const result = toColumnMappingConfig({ mapping: { ...baseMapping, currency: null } });
    expect(result).toBeNull();
  });

  it('returns null when multiple required fields are null', () => {
    const result = toColumnMappingConfig({
      mapping: { ...baseMapping, date: null, amount: null },
    });
    expect(result).toBeNull();
  });

  it('returns null when account picks existing-account but no id is set', () => {
    const account: AccountOption = { option: AccountOptionValue.existingAccount, accountId: '' };
    const result = toColumnMappingConfig({ mapping: { ...baseMapping, account } });
    expect(result).toBeNull();
  });

  it('returns null when category picks existing-category but no id is set', () => {
    const category: CategoryOption = { option: CategoryOptionValue.existingCategory, categoryId: '' };
    const result = toColumnMappingConfig({ mapping: { ...baseMapping, category } });
    expect(result).toBeNull();
  });

  it('returns null when currency picks existing-currency but no code is set', () => {
    const currency: CurrencyOption = { option: CurrencyOptionValue.existingCurrency, currencyCode: '' };
    const result = toColumnMappingConfig({ mapping: { ...baseMapping, currency } });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// happy path — all required fields present
// ---------------------------------------------------------------------------

describe('toColumnMappingConfig — full ColumnMappingConfig when all required fields present', () => {
  it('returns the full config object with required fields passed through', () => {
    const result = toColumnMappingConfig({ mapping: baseMapping });
    expect(result).toEqual({
      date: 'Date',
      dateFieldOrder: 'month-first',
      amount: 'Amount',
      description: 'Memo',
      category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Category' },
      account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
      currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
      transactionType: { option: TransactionTypeOptionValue.amountSign },
      // tags is null in baseMapping → projected to undefined (omitted)
    });
  });

  it('converts empty-string description to undefined', () => {
    const result = toColumnMappingConfig({
      mapping: { ...baseMapping, description: '' },
    });
    expect(result).not.toBeNull();
    expect(result!.description).toBeUndefined();
  });

  it('converts null tags to undefined', () => {
    const result = toColumnMappingConfig({
      mapping: { ...baseMapping, tags: null },
    });
    expect(result).not.toBeNull();
    expect(result!.tags).toBeUndefined();
  });

  it('passes through non-null tags', () => {
    const tags: TagOption = { option: TagOptionValue.mapDataSourceColumn, columnName: 'Labels' };
    const result = toColumnMappingConfig({
      mapping: { ...baseMapping, tags },
    });
    expect(result).not.toBeNull();
    expect(result!.tags).toEqual(tags);
  });

  it('passes through transactionType (dataSourceColumn variant)', () => {
    const transactionType = {
      option: TransactionTypeOptionValue.dataSourceColumn,
      columnName: 'Type',
      incomeValues: ['credit'],
      expenseValues: ['debit'],
    };
    const result = toColumnMappingConfig({
      mapping: { ...baseMapping, transactionType },
    });
    expect(result).not.toBeNull();
    expect(result!.transactionType).toEqual(transactionType);
  });

  it('does not include description key when description is null', () => {
    const result = toColumnMappingConfig({
      mapping: { ...baseMapping, description: null },
    });
    expect(result).not.toBeNull();
    // null → falsy → undefined (same as empty string branch)
    expect(result!.description).toBeUndefined();
  });

  it('passes through a non-empty description unchanged', () => {
    const result = toColumnMappingConfig({
      mapping: { ...baseMapping, description: 'Notes' },
    });
    expect(result).not.toBeNull();
    expect(result!.description).toBe('Notes');
  });

  it('converts empty-string payee to undefined', () => {
    const result = toColumnMappingConfig({
      mapping: { ...baseMapping, payee: '' },
    });
    expect(result).not.toBeNull();
    expect(result!.payee).toBeUndefined();
  });

  it('does not include payee key when payee is null', () => {
    const result = toColumnMappingConfig({
      mapping: { ...baseMapping, payee: null },
    });
    expect(result).not.toBeNull();
    expect(result!.payee).toBeUndefined();
  });

  it('passes through a non-empty payee unchanged', () => {
    const result = toColumnMappingConfig({
      mapping: { ...baseMapping, payee: 'Merchant' },
    });
    expect(result).not.toBeNull();
    expect(result!.payee).toBe('Merchant');
  });

  it('passes through existingCategory variant for category', () => {
    const category: CategoryOption = { option: CategoryOptionValue.existingCategory, categoryId: 'cat-1' };
    const result = toColumnMappingConfig({ mapping: { ...baseMapping, category } });
    expect(result).not.toBeNull();
    expect(result!.category).toEqual(category);
  });

  it('passes through existingAccount variant for account', () => {
    const account: AccountOption = { option: AccountOptionValue.existingAccount, accountId: 'acc-1' };
    const result = toColumnMappingConfig({ mapping: { ...baseMapping, account } });
    expect(result).not.toBeNull();
    expect(result!.account).toEqual(account);
  });

  it('passes through existingCurrency variant for currency', () => {
    const currency: CurrencyOption = { option: CurrencyOptionValue.existingCurrency, currencyCode: 'USD' };
    const result = toColumnMappingConfig({ mapping: { ...baseMapping, currency } });
    expect(result).not.toBeNull();
    expect(result!.currency).toEqual(currency);
  });
});
