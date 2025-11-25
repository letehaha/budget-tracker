import {
  AccountOptionValue,
  CategoryOptionValue,
  CurrencyOptionValue,
  TransactionTypeOptionValue,
} from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

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

    it('should extract multiple accounts with different currencies', async () => {
      const fileContent = helpers.loadCsvFixture('multiple-accounts.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
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

      expect(result.sourceAccounts.length).toBeGreaterThanOrEqual(3);
      const accountNames = result.sourceAccounts.map((a) => a.name);
      expect(accountNames).toContain('Checking Account');
      expect(accountNames).toContain('Savings Account');
      expect(accountNames).toContain('Credit Card');
    });

    it('should work with amountSign transaction type option', async () => {
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
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

      expect(result.sourceAccounts).toHaveLength(1);
      expect(result.sourceCategories.length).toBeGreaterThan(0);
    });

    it('should work with createNewCategories option', async () => {
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            amount: 'Amount',
            description: 'Description',
            category: { option: CategoryOptionValue.createNewCategories, columnName: 'Category' },
            currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
            transactionType: { option: TransactionTypeOptionValue.amountSign },
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
          },
        },
        raw: true,
      });

      // Should still extract categories for display
      expect(result.sourceCategories.length).toBeGreaterThan(0);
    });
  });

  describe('using existing entities', () => {
    it('should validate existing account belongs to user', async () => {
      const account = await helpers.createAccount({ raw: true });
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
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

      // When using existing account, no accounts should be extracted from CSV
      expect(result.sourceAccounts).toHaveLength(0);
    });

    it('should validate existing category belongs to user', async () => {
      const categories = await helpers.getCategoriesList();
      const existingCategory = categories[0]!;
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
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

      // When using existing category, no categories should be extracted
      expect(result.sourceCategories).toHaveLength(0);
    });

    it('should work with existing currency option', async () => {
      const fileContent = helpers.loadCsvFixture('minimal-columns.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            amount: 'Amount',
            category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Date' }, // Use Date as fake category
            currency: { option: CurrencyOptionValue.existingCurrency, currencyCode: 'USD' },
            transactionType: { option: TransactionTypeOptionValue.amountSign },
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Date' }, // Use Date as fake account
          },
        },
        raw: true,
      });

      expect(result.sourceAccounts.length).toBeGreaterThan(0);
      // All accounts should have the specified currency
      result.sourceAccounts.forEach((acc) => {
        expect(acc.currency).toBe('USD');
      });
    });

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

    it('should handle createNewCategories with existing account and currency', async () => {
      const account = await helpers.createAccount({ raw: true });
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            amount: 'Amount',
            description: 'Description',
            category: { option: CategoryOptionValue.createNewCategories, columnName: 'Category' },
            currency: { option: CurrencyOptionValue.existingCurrency, currencyCode: 'EUR' },
            transactionType: {
              option: TransactionTypeOptionValue.dataSourceColumn,
              columnName: 'Type',
              incomeValues: ['income'],
              expenseValues: ['expense'],
            },
            account: { option: AccountOptionValue.existingAccount, accountId: account.id },
          },
        },
        raw: true,
      });

      // Should extract categories for preview
      expect(result.sourceAccounts).toHaveLength(0);
      expect(result.sourceCategories.length).toBeGreaterThan(0);
    });

    it('should handle mapDataSourceColumn with dataSourceColumn for all options', async () => {
      const fileContent = helpers.loadCsvFixture('multiple-accounts.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
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
      expect(result1.sourceCategories.sort()).toEqual(result2.sourceCategories.sort());
    });

    it('should handle currency mismatch warning with existing account', async () => {
      // Create account with GBP currency
      await helpers.addUserCurrencies({ currencyCodes: ['GBP'] });
      const account = await helpers.createAccount({
        payload: {
          ...helpers.buildAccountPayload(),
          currencyCode: 'GBP',
        },
        raw: true,
      });

      // CSV has EUR and USD in multiple-accounts.csv
      const fileContent = helpers.loadCsvFixture('multiple-accounts.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            amount: 'Amount',
            description: 'Description',
            category: { option: CategoryOptionValue.createNewCategories, columnName: 'Category' },
            currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
            transactionType: { option: TransactionTypeOptionValue.amountSign },
            account: { option: AccountOptionValue.existingAccount, accountId: account.id },
          },
        },
        raw: true,
      });

      // Should warn about currency mismatch
      expect(result.currencyMismatchWarning).toBeDefined();
      expect(result.currencyMismatchWarning).toContain('GBP');
      // Warning should mention at least one currency from CSV (USD or EUR)
      const hasUSD = result.currencyMismatchWarning?.includes('USD');
      const hasEUR = result.currencyMismatchWarning?.includes('EUR');
      expect(hasUSD || hasEUR).toBe(true);
    });
  });

  describe('validation errors', () => {
    it('should return error for non-existent date column', async () => {
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'NonExistentColumn',
            amount: 'Amount',
            category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Category' },
            currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
            transactionType: { option: TransactionTypeOptionValue.amountSign },
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
          },
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should return error for non-existent amount column', async () => {
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            amount: 'NonExistentColumn',
            category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Category' },
            currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
            transactionType: { option: TransactionTypeOptionValue.amountSign },
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
          },
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should return error for non-existent account that does not belong to user', async () => {
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            amount: 'Amount',
            category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Category' },
            currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
            transactionType: { option: TransactionTypeOptionValue.amountSign },
            account: { option: AccountOptionValue.existingAccount, accountId: 999999 },
          },
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('should return error for non-existent category that does not belong to user', async () => {
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            amount: 'Amount',
            category: { option: CategoryOptionValue.existingCategory, categoryId: 999999 },
            currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
            transactionType: { option: TransactionTypeOptionValue.amountSign },
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
          },
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('should return error for invalid currency code', async () => {
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            amount: 'Amount',
            category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Category' },
            currency: { option: CurrencyOptionValue.existingCurrency, currencyCode: 'INVALID' },
            transactionType: { option: TransactionTypeOptionValue.amountSign },
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
          },
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should return error for non-existent currency column', async () => {
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            amount: 'Amount',
            category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Category' },
            currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'NonExistentColumn' },
            transactionType: { option: TransactionTypeOptionValue.amountSign },
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
          },
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should return error for non-existent account column', async () => {
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            amount: 'Amount',
            category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Category' },
            currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
            transactionType: { option: TransactionTypeOptionValue.amountSign },
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'NonExistentColumn' },
          },
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should return error for non-existent category column', async () => {
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            amount: 'Amount',
            category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'NonExistentColumn' },
            currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
            transactionType: { option: TransactionTypeOptionValue.amountSign },
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
          },
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should return error for non-existent transaction type column', async () => {
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            amount: 'Amount',
            category: { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'Category' },
            currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
            transactionType: {
              option: TransactionTypeOptionValue.dataSourceColumn,
              columnName: 'NonExistentColumn',
              incomeValues: ['income'],
              expenseValues: ['expense'],
            },
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
          },
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should return error when createNewCategories references non-existent column', async () => {
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.extractUniqueValues({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            amount: 'Amount',
            category: { option: CategoryOptionValue.createNewCategories, columnName: 'NonExistentColumn' },
            currency: { option: CurrencyOptionValue.dataSourceColumn, columnName: 'Currency' },
            transactionType: { option: TransactionTypeOptionValue.amountSign },
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
          },
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});
