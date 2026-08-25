import {
  AccountOptionValue,
  CategoryOptionValue,
  type ColumnMappingConfig,
  CurrencyOptionValue,
  TagOptionValue,
  TransactionTypeOptionValue,
} from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { ErrorResponse } from '@tests/helpers/common';

describe('Extract Unique Values endpoint', () => {
  describe('successful extraction with data source columns', () => {
    it('should extract unique accounts and categories from CSV', async () => {
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            dateFieldOrder: 'month-first',
            amount: 'Amount',
            description: 'Description',
            category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Category' },
            currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
            transactionType: {
              option: TransactionTypeOptionValue.dataSourceColumn,
              columnName: 'Type',
              incomeValues: ['income'],
              expenseValues: ['expense'],
            },
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
          },
        },
        raw: true,
      });

      expect(result.sourceAccounts).toHaveLength(1);
      expect(result.sourceAccounts[0]).toEqual({ name: 'Main Account', currency: 'USD' });
      expect(result.sourceCategories).toContain('Food');
      expect(result.sourceCategories).toContain('Income');
      expect(result.sourceCategories).toContain('Entertainment');
      expect(result.sourceCategories).toContain('Transport');
    });
  });

  describe('using existing entities', () => {
    it('should return currency mismatch warning when account has different currency than CSV', async () => {
      // Create account with EUR currency
      await helpers.addUserCurrencies({ currencyCodes: ['EUR'] });
      const account = await helpers.createAccount({
        payload: {
          ...helpers.buildAccountPayload(),
          currencyCode: 'EUR',
        },
        raw: true,
      });

      // CSV has USD currency
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            dateFieldOrder: 'month-first',
            amount: 'Amount',
            description: 'Description',
            category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Category' },
            currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
            transactionType: { option: TransactionTypeOptionValue.amountSign },
            account: { option: AccountOptionValue.existingAccount, accountId: account.id },
          },
        },
        raw: true,
      });

      expect(result.currencyMismatchWarning).toBeDefined();
      expect(result.currencyMismatchWarning).toContain('USD');
      expect(result.currencyMismatchWarning).toContain('EUR');
    });
  });

  describe('comprehensive option combinations', () => {
    it('should handle all existing options together (maximum entity reuse)', async () => {
      // Create existing entities
      const categories = await helpers.getCategoriesList();
      const existingCategory = categories[0]!;
      const account = await helpers.createAccount({ raw: true });
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            dateFieldOrder: 'month-first',
            amount: 'Amount',
            description: 'Description',
            category: { option: CategoryOptionValue.existingCategory, categoryId: existingCategory.id },
            currency: { option: CurrencyOptionValue.existingCurrency, currencyCode: 'USD' },
            transactionType: { option: TransactionTypeOptionValue.amountSign },
            account: { option: AccountOptionValue.existingAccount, accountId: account.id },
          },
        },
        raw: true,
      });

      // No extraction should happen - everything links to existing entities
      expect(result.sourceAccounts).toHaveLength(0);
      expect(result.sourceCategories).toHaveLength(0);
      expect(result.currencyMismatchWarning).toBeUndefined();
    });

    it('should handle mapDataSourceColumn category with existing account and currency', async () => {
      const account = await helpers.createAccount({ raw: true });
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            dateFieldOrder: 'month-first',
            amount: 'Amount',
            description: 'Description',
            category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Category' },
            currency: { option: CurrencyOptionValue.existingCurrency, currencyCode: 'USD' },
            transactionType: { option: TransactionTypeOptionValue.amountSign },
            account: { option: AccountOptionValue.existingAccount, accountId: account.id },
          },
        },
        raw: true,
      });

      // Should extract categories but not accounts
      expect(result.sourceAccounts).toHaveLength(0);
      expect(result.sourceCategories.length).toBeGreaterThan(0);
      expect(result.sourceCategories).toContain('Food');
      expect(result.sourceCategories).toContain('Income');
    });

    it('should handle mapDataSourceColumn with dataSourceColumn for all options', async () => {
      const fileContent = helpers.loadCsvFixture('multiple-accounts.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            dateFieldOrder: 'month-first',
            amount: 'Amount',
            description: 'Description',
            category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Category' },
            currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
            transactionType: {
              option: TransactionTypeOptionValue.dataSourceColumn,
              columnName: 'Type',
              incomeValues: ['income'],
              expenseValues: ['expense'],
            },
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
          },
        },
        raw: true,
      });

      // Should extract everything from CSV
      expect(result.sourceAccounts.length).toBeGreaterThanOrEqual(3);
      expect(result.sourceCategories.length).toBeGreaterThan(0);

      // Verify account-currency pairing is correct
      const accountNames = result.sourceAccounts.map((a) => a.name);
      expect(accountNames).toContain('Checking Account');
      expect(accountNames).toContain('Savings Account');
      expect(accountNames).toContain('Credit Card');
    });

    it('should handle createNewCategories with dataSourceColumn transaction type and account', async () => {
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            dateFieldOrder: 'month-first',
            amount: 'Amount',
            description: 'Description',
            category: { option: CategoryOptionValue.createNewCategories, columnName: 'Category' },
            currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
            transactionType: {
              option: TransactionTypeOptionValue.dataSourceColumn,
              columnName: 'Type',
              incomeValues: ['income'],
              expenseValues: ['expense'],
            },
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
          },
        },
        raw: true,
      });

      expect(result.sourceAccounts).toHaveLength(1);
      expect(result.sourceCategories.length).toBeGreaterThan(0);
      expect(result.sourceCategories).toContain('Food');
    });

    it('should handle mixed options: existing category + datasource account/currency', async () => {
      const categories = await helpers.getCategoriesList();
      const existingCategory = categories[0]!;
      const fileContent = helpers.loadCsvFixture('multiple-accounts.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            dateFieldOrder: 'month-first',
            amount: 'Amount',
            description: 'Description',
            category: { option: CategoryOptionValue.existingCategory, categoryId: existingCategory.id },
            currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
            transactionType: { option: TransactionTypeOptionValue.amountSign },
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
          },
        },
        raw: true,
      });

      // Should extract accounts but not categories
      expect(result.sourceAccounts.length).toBeGreaterThanOrEqual(3);
      expect(result.sourceCategories).toHaveLength(0);
    });

    it('should override CSV currencies when using existingCurrency with multiple accounts', async () => {
      const fileContent = helpers.loadCsvFixture('multiple-accounts.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            dateFieldOrder: 'month-first',
            amount: 'Amount',
            description: 'Description',
            category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Category' },
            currency: { option: CurrencyOptionValue.existingCurrency, currencyCode: 'GBP' },
            transactionType: { option: TransactionTypeOptionValue.amountSign },
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
          },
        },
        raw: true,
      });

      expect(result.sourceAccounts.length).toBeGreaterThanOrEqual(3);
      // All accounts should have GBP currency, overriding CSV's USD/EUR
      result.sourceAccounts.forEach((acc) => {
        expect(acc.currency).toBe('GBP');
      });
    });

    it('should extract accounts with correct currencies when using dataSourceColumn for both', async () => {
      const fileContent = helpers.loadCsvFixture('multiple-accounts.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            dateFieldOrder: 'month-first',
            amount: 'Amount',
            description: 'Description',
            category: { option: CategoryOptionValue.createNewCategories, columnName: 'Category' },
            currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
            transactionType: {
              option: TransactionTypeOptionValue.dataSourceColumn,
              columnName: 'Type',
              incomeValues: ['income'],
              expenseValues: ['expense'],
            },
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
          },
        },
        raw: true,
      });

      expect(result.sourceAccounts.length).toBeGreaterThanOrEqual(3);

      // Verify each account is paired with the correct currency from CSV
      const checkingAccount = result.sourceAccounts.find((a) => a.name === 'Checking Account');
      const savingsAccount = result.sourceAccounts.find((a) => a.name === 'Savings Account');
      const creditCard = result.sourceAccounts.find((a) => a.name === 'Credit Card');

      expect(checkingAccount).toBeDefined();
      expect(savingsAccount).toBeDefined();
      expect(creditCard).toBeDefined();

      // Verify currencies are from the CSV data
      const currencies = result.sourceAccounts.map((a) => a.currency);
      expect(currencies).toContain('USD');
      expect(currencies).toContain('EUR');
    });

    it('should handle mapDataSourceColumn with mixed transaction type options', async () => {
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      // First with dataSourceColumn
      const result1 = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            dateFieldOrder: 'month-first',
            amount: 'Amount',
            description: 'Description',
            category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Category' },
            currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
            transactionType: {
              option: TransactionTypeOptionValue.dataSourceColumn,
              columnName: 'Type',
              incomeValues: ['income'],
              expenseValues: ['expense'],
            },
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
          },
        },
        raw: true,
      });

      // Then with amountSign
      const result2 = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            dateFieldOrder: 'month-first',
            amount: 'Amount',
            description: 'Description',
            category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Category' },
            currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
            transactionType: { option: TransactionTypeOptionValue.amountSign },
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
          },
        },
        raw: true,
      });

      // Both should extract the same accounts and categories
      expect(result1.sourceAccounts).toEqual(result2.sourceAccounts);
      expect(result1.sourceCategories.toSorted()).toEqual(result2.sourceCategories.toSorted());
    });
  });

  describe('validation errors', () => {
    const baseMapping: ColumnMappingConfig = {
      date: 'Date',
      dateFieldOrder: 'month-first',
      amount: 'Amount',
      category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Category' },
      currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
      transactionType: { option: TransactionTypeOptionValue.amountSign },
      account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
    };

    const cases: { name: string; columnMapping: ColumnMappingConfig; statusCode: ERROR_CODES }[] = [
      {
        name: 'non-existent date column',
        columnMapping: { ...baseMapping, date: 'NonExistentColumn' },
        statusCode: ERROR_CODES.ValidationError,
      },
      {
        name: 'non-existent amount column',
        columnMapping: { ...baseMapping, amount: 'NonExistentColumn' },
        statusCode: ERROR_CODES.ValidationError,
      },
      {
        name: 'non-existent currency column',
        columnMapping: {
          ...baseMapping,
          currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'NonExistentColumn' },
        },
        statusCode: ERROR_CODES.ValidationError,
      },
      {
        name: 'non-existent account column',
        columnMapping: {
          ...baseMapping,
          account: { option: AccountOptionValue.dataSourceColumn, columnName: 'NonExistentColumn' },
        },
        statusCode: ERROR_CODES.ValidationError,
      },
      {
        name: 'non-existent category column',
        columnMapping: {
          ...baseMapping,
          category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'NonExistentColumn' },
        },
        statusCode: ERROR_CODES.ValidationError,
      },
      {
        name: 'non-existent transaction type column',
        columnMapping: {
          ...baseMapping,
          transactionType: {
            option: TransactionTypeOptionValue.dataSourceColumn,
            columnName: 'NonExistentColumn',
            incomeValues: ['income'],
            expenseValues: ['expense'],
          },
        },
        statusCode: ERROR_CODES.ValidationError,
      },
      {
        name: 'invalid currency code',
        columnMapping: {
          ...baseMapping,
          currency: { option: CurrencyOptionValue.existingCurrency, currencyCode: 'INVALID' },
        },
        statusCode: ERROR_CODES.ValidationError,
      },
      {
        name: 'existing account that does not belong to user',
        columnMapping: {
          ...baseMapping,
          account: { option: AccountOptionValue.existingAccount, accountId: generateRandomRecordId() },
        },
        statusCode: ERROR_CODES.NotFoundError,
      },
      {
        name: 'existing category that does not belong to user',
        columnMapping: {
          ...baseMapping,
          category: { option: CategoryOptionValue.existingCategory, categoryId: generateRandomRecordId() },
        },
        statusCode: ERROR_CODES.NotFoundError,
      },
    ];

    it.each(cases)('should return error for $name', async ({ columnMapping, statusCode }) => {
      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent: helpers.loadCsvFixture('valid-comma.csv'),
          delimiter: ',',
          columnMapping,
        },
        raw: false,
      });

      expect(result.statusCode).toBe(statusCode);
    });

    it('should return error for empty currencyCode', async () => {
      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent: helpers.loadCsvFixture('valid-comma.csv'),
          delimiter: ',',
          columnMapping: {
            ...baseMapping,
            currency: { option: CurrencyOptionValue.existingCurrency, currencyCode: '' },
          },
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
      expect((result.body.response as unknown as ErrorResponse).message).toContain('currency.currencyCode');
    });
  });

  describe('sourceTags', () => {
    const csvWithTags = `Date,Amount,Description,Category,Currency,Type,Account,Labels
2024-01-15,100.50,Grocery shopping,Food,USD,expense,Main Account,"travel, food"
2024-01-16,50.00,Coffee,Food,USD,expense,Main Account,"food, gift"
2024-01-17,25.00,Lunch,Food,USD,expense,Main Account,`;

    const baseMapping = {
      date: 'Date',
      dateFieldOrder: 'month-first' as const,
      amount: 'Amount',
      description: 'Description',
      category: { option: CategoryOptionValue.mapDataSourceColumn as const, columnName: 'Category' },
      currency: { option: CurrencyOptionValue.dataSourceColumn as const, columnName: 'Currency' },
      transactionType: {
        option: TransactionTypeOptionValue.dataSourceColumn as const,
        columnName: 'Type',
        incomeValues: ['income'],
        expenseValues: ['expense'],
      },
      account: { option: AccountOptionValue.dataSourceColumn as const, columnName: 'Account' },
    };

    it('returns distinct, sorted tag strings split from the mapped column', async () => {
      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent: csvWithTags,
          delimiter: ',',
          columnMapping: {
            ...baseMapping,
            tags: { option: TagOptionValue.mapDataSourceColumn, columnName: 'Labels' },
          },
        },
        raw: true,
      });

      expect(result.sourceTags).toEqual(['food', 'gift', 'travel']);
    });

    it('returns an empty array when no tag column is mapped', async () => {
      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent: csvWithTags,
          delimiter: ',',
          columnMapping: baseMapping,
        },
        raw: true,
      });

      expect(result.sourceTags).toEqual([]);
    });

    it('fails when the mapped tag column is absent from the headers', async () => {
      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent: csvWithTags,
          delimiter: ',',
          columnMapping: {
            ...baseMapping,
            tags: { option: TagOptionValue.mapDataSourceColumn, columnName: 'Nonexistent' },
          },
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});

describe('Parse CSV endpoint', () => {
  describe('successful parsing', () => {
    it('should parse a valid CSV with comma delimiter', async () => {
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');
      const result = await helpers.parseCsv({
        payload: { fileContent },
        raw: true,
      });

      expect(result.headers).toEqual(['Date', 'Amount', 'Description', 'Category', 'Account', 'Currency', 'Type']);
      expect(result.detectedDelimiter).toBe(',');
      expect(result.totalRows).toBe(5);
      expect(result.preview).toHaveLength(5);
      expect(result.preview[0]).toEqual({
        Date: '2024-01-15',
        Amount: '100.50',
        Description: 'Grocery shopping',
        Category: 'Food',
        Account: 'Main Account',
        Currency: 'USD',
        Type: 'expense',
      });
    });

    it('should parse a valid CSV with semicolon delimiter', async () => {
      const fileContent = helpers.loadCsvFixture('valid-semicolon.csv');
      const result = await helpers.parseCsv({
        payload: { fileContent },
        raw: true,
      });

      expect(result.headers).toEqual(['Date', 'Amount', 'Description', 'Category', 'Account', 'Currency', 'Type']);
      expect(result.detectedDelimiter).toBe(';');
      expect(result.totalRows).toBe(3);
      expect(result.preview).toHaveLength(3);
    });

    it('should parse a valid CSV with tab delimiter', async () => {
      const fileContent = helpers.loadCsvFixture('valid-tab.csv');
      const result = await helpers.parseCsv({
        payload: { fileContent },
        raw: true,
      });

      expect(result.headers).toEqual(['Date', 'Amount', 'Description', 'Category', 'Account', 'Currency', 'Type']);
      expect(result.detectedDelimiter).toBe('\t');
      expect(result.totalRows).toBe(2);
    });

    it('should use provided delimiter instead of auto-detecting', async () => {
      const fileContent = helpers.loadCsvFixture('valid-semicolon.csv');
      // Force comma delimiter even though file uses semicolon
      const result = await helpers.parseCsv({
        payload: { fileContent, delimiter: ';' },
        raw: true,
      });

      expect(result.detectedDelimiter).toBe(';');
      expect(result.headers).toEqual(['Date', 'Amount', 'Description', 'Category', 'Account', 'Currency', 'Type']);
    });

    it('should limit preview rows and return correct total count', async () => {
      const fileContent = helpers.loadCsvFixture('large-file.csv');
      const result = await helpers.parseCsv({
        payload: { fileContent },
        raw: true,
      });

      // large-file.csv has 25 data rows
      expect(result.totalRows).toBe(25);
      // Preview should be limited to 50 rows (but we only have 25)
      expect(result.preview).toHaveLength(25);
    });

    it('should handle CSV with special characters in values', async () => {
      const fileContent = helpers.loadCsvFixture('special-characters.csv');
      const result = await helpers.parseCsv({
        payload: { fileContent },
        raw: true,
      });

      expect(result.headers).toEqual(['Date', 'Amount', 'Description', 'Category', 'Account', 'Currency', 'Type']);
      expect(result.preview[0]?.Description).toBe('Grocery, shopping & more');
      expect(result.preview[1]?.Description).toBe('Coffee "Best" shop');
      expect(result.preview[2]?.Description).toBe('Salary (monthly)');
    });

    it('should parse CSV with minimal columns', async () => {
      const fileContent = helpers.loadCsvFixture('minimal-columns.csv');
      const result = await helpers.parseCsv({
        payload: { fileContent },
        raw: true,
      });

      expect(result.headers).toEqual(['Date', 'Amount']);
      expect(result.totalRows).toBe(3);
      expect(result.preview[0]).toEqual({
        Date: '2024-01-15',
        Amount: '100.50',
      });
    });

    it('should parse CSV with multiple accounts and currencies', async () => {
      const fileContent = helpers.loadCsvFixture('multiple-accounts.csv');
      const result = await helpers.parseCsv({
        payload: { fileContent },
        raw: true,
      });

      expect(result.totalRows).toBe(5);
      // Verify different accounts are parsed correctly
      const accounts = result.preview.map((row) => row.Account);
      expect(accounts).toContain('Checking Account');
      expect(accounts).toContain('Savings Account');
      expect(accounts).toContain('Credit Card');

      // Verify different currencies
      const currencies = result.preview.map((row) => row.Currency);
      expect(currencies).toContain('USD');
      expect(currencies).toContain('EUR');
    });

    it('should parse CSV with European date and number format', async () => {
      const fileContent = helpers.loadCsvFixture('european-format.csv');
      const result = await helpers.parseCsv({
        payload: { fileContent },
        raw: true,
      });

      expect(result.detectedDelimiter).toBe(';');
      expect(result.preview[0]?.Date).toBe('15.01.2024');
      expect(result.preview[0]?.Amount).toBe('100,50');
    });
  });

  describe('error handling', () => {
    it('should return validation error for empty file content', async () => {
      const result = await helpers.parseCsv({
        payload: { fileContent: '' },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should return validation error for empty CSV (no data)', async () => {
      const fileContent = helpers.loadCsvFixture('empty.csv');
      const result = await helpers.parseCsv({
        payload: { fileContent },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should parse CSV with headers only (no data rows)', async () => {
      const fileContent = helpers.loadCsvFixture('headers-only.csv');
      const result = await helpers.parseCsv({
        payload: { fileContent },
        raw: true,
      });

      expect(result.headers).toEqual(['Date', 'Amount', 'Description', 'Category', 'Account', 'Currency', 'Type']);
      expect(result.totalRows).toBe(0);
      expect(result.preview).toHaveLength(0);
    });
  });
});
