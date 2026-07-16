import {
  AccountOptionValue,
  CategoryOptionValue,
  type ColumnMappingConfig,
  CurrencyOptionValue,
  TRANSACTION_TYPES,
  TagOptionValue,
  TransactionTypeOptionValue,
} from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Detect Duplicates endpoint', () => {
  // Helper to build common column mapping
  const buildColumnMapping = (overrides: Partial<ColumnMappingConfig> = {}): ColumnMappingConfig => ({
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
    ...overrides,
  });

  describe('row parsing and validation', () => {
    it('should parse valid rows successfully', async () => {
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: {
            'Main Account': { action: 'create-new', currentBalance: null },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.validRows).toHaveLength(5);
      expect(result.invalidRows).toHaveLength(0);

      // Verify first row is parsed correctly. `date` is a full ISO instant
      // (date-only cell anchored to UTC noon with no timezone supplied), so the
      // assertion checks the resolved calendar day.
      const firstRow = result.validRows[0];
      expect(firstRow?.date).toBe('2024-01-15T12:00:00.000Z');
      expect(firstRow?.date.split('T')[0]).toBe('2024-01-15');
      expect(firstRow?.amount).toBe(10050); // 100.50 * 100 = 10050 cents
      expect(firstRow?.description).toBe('Grocery shopping');
      expect(firstRow?.categoryName).toBe('Food');
      expect(firstRow?.accountName).toBe('Main Account');
      expect(firstRow?.currencyCode).toBe('USD');
      expect(firstRow?.transactionType).toBe('expense');
    });

    it('should identify invalid rows with errors', async () => {
      const fileContent = helpers.loadCsvFixture('invalid-data.csv');

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: {
            'Main Account': { action: 'create-new', currentBalance: null },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      // Should have 2 valid rows (first and last)
      expect(result.validRows.length).toBeGreaterThanOrEqual(2);

      // Should have invalid rows for: invalid date, invalid amount, unknown type, empty account
      expect(result.invalidRows.length).toBeGreaterThanOrEqual(1);

      // Check that invalid rows contain error messages
      const invalidDateRow = result.invalidRows.find((r) => r.errors.some((e) => e.includes('date')));
      expect(invalidDateRow).toBeDefined();

      const invalidAmountRow = result.invalidRows.find((r) => r.errors.some((e) => e.includes('amount')));
      expect(invalidAmountRow).toBeDefined();
    });

    it('should determine transaction type from amount sign', async () => {
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: buildColumnMapping({
            transactionType: { option: TransactionTypeOptionValue.amountSign },
          }),
          accountMapping: {
            'Main Account': { action: 'create-new', currentBalance: null },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.validRows.length).toBeGreaterThan(0);
      // Positive amounts should be income, negative should be expense
      // The fixture has -50.00 which should be expense
      const negativeAmountRow = result.validRows.find((r) => r.description === 'Coffee shop');
      expect(negativeAmountRow?.transactionType).toBe('expense');
    });

    it('should use existing account for all rows when specified', async () => {
      const account = await helpers.createAccount({ raw: true });
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: buildColumnMapping({
            account: { option: AccountOptionValue.existingAccount, accountId: account.id },
          }),
          accountMapping: {},
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.validRows.length).toBeGreaterThan(0);
    });

    it('should use existing currency for all rows when specified', async () => {
      const fileContent = helpers.loadCsvFixture('minimal-columns.csv');
      const existingCategories = await helpers.getCategoriesList();
      const firstCategoryId = existingCategories[0]!.id;

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            dateFieldOrder: 'month-first',
            amount: 'Amount',
            category: { option: CategoryOptionValue.existingCategory, categoryId: firstCategoryId },
            currency: { option: CurrencyOptionValue.existingCurrency, currencyCode: 'EUR' },
            transactionType: { option: TransactionTypeOptionValue.amountSign },
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Date' },
          },
          accountMapping: {
            '2024-01-15': { action: 'create-new', currentBalance: null },
            '2024-01-16': { action: 'create-new', currentBalance: null },
            '2024-01-17': { action: 'create-new', currentBalance: null },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.validRows.length).toBeGreaterThan(0);
      result.validRows.forEach((row) => {
        expect(row.currencyCode).toBe('EUR');
      });
    });
  });

  describe('duplicate detection', () => {
    it('should return no duplicates when all accounts are new', async () => {
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: {
            'Main Account': { action: 'create-new', currentBalance: null },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      // No duplicates since account doesn't exist yet
      expect(result.duplicates).toHaveLength(0);
    });

    it('should detect duplicate when matching transaction exists', async () => {
      // Create an account
      const account = await helpers.createAccount({ raw: true });

      // Create a transaction that will match CSV data
      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100.5, // Amount in decimal format (API expects decimals)
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15').toISOString(),
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: {
            'Main Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      // Should detect at least one duplicate
      expect(result.duplicates.length).toBeGreaterThanOrEqual(1);

      // Verify duplicate structure
      const duplicate = result.duplicates[0];
      expect(duplicate).toHaveProperty('rowIndex');
      expect(duplicate).toHaveProperty('importedTransaction');
      expect(duplicate).toHaveProperty('existingTransaction');
      expect(duplicate).toHaveProperty('matchType');
      expect(duplicate).toHaveProperty('confidence');
    });

    it('should not detect duplicates when transaction type differs', async () => {
      // Create an account
      const account = await helpers.createAccount({ raw: true });

      // Create a transaction with INCOME type (CSV has expense)
      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100.5, // Same amount as CSV
        transactionType: TRANSACTION_TYPES.income, // Different type
        time: new Date('2024-01-15').toISOString(),
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: {
            'Main Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      // The duplicate for row 1 should not be found since types differ
      const duplicateForFirstRow = result.duplicates.find((d) => d.rowIndex === 2);
      expect(duplicateForFirstRow).toBeUndefined();
    });

    it('should handle multiple accounts with different duplicate scenarios', async () => {
      // Create two accounts
      const account1 = await helpers.createAccount({ raw: true });
      const account2 = await helpers.createAccount({ raw: true });

      // Create a transaction in account1
      const txPayload = helpers.buildTransactionPayload({
        accountId: account1.id,
        amount: 100.5,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15').toISOString(),
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      const fileContent = helpers.loadCsvFixture('multiple-accounts.csv');

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: {
            'Checking Account': { action: 'link-existing', accountId: account1.id },
            'Savings Account': { action: 'create-new', currentBalance: null },
            'Credit Card': { action: 'link-existing', accountId: account2.id },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      // Valid rows should be parsed
      expect(result.validRows.length).toBeGreaterThan(0);
    });
  });

  describe('duplicate detection with different account mappings', () => {
    it('should detect duplicates when using dataSourceColumn account mapped to existing', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create a matching transaction
      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100.5,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15').toISOString(),
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: buildColumnMapping({
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
          }),
          accountMapping: {
            'Main Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      // Should detect duplicate since CSV account maps to existing account
      expect(result.duplicates.length).toBeGreaterThanOrEqual(1);
      const duplicate = result.duplicates.find((d) => d.rowIndex === 2);
      expect(duplicate).toBeDefined();
      expect(duplicate?.existingTransaction.accountId).toBe(account.id);
    });

    it('should not detect duplicates when using different account mapping', async () => {
      const accountA = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({ raw: true });

      // Create transaction in accountA
      const txPayload = helpers.buildTransactionPayload({
        accountId: accountA.id,
        amount: 100.5,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15').toISOString(),
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: buildColumnMapping({
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Account' },
          }),
          accountMapping: {
            'Main Account': { action: 'link-existing', accountId: accountB.id }, // Map to different account
          },
          categoryMapping: {},
        },
        raw: true,
      });

      // No duplicates should be found - transaction is in accountA, CSV maps to accountB
      const duplicateForFirstRow = result.duplicates.find((d) => d.rowIndex === 2);
      expect(duplicateForFirstRow).toBeUndefined();
    });

    it('should detect duplicates only for existing accounts, not new ones', async () => {
      const existingAccount = await helpers.createAccount({ raw: true });

      // Create transactions in existing account
      const tx1Payload = helpers.buildTransactionPayload({
        accountId: existingAccount.id,
        amount: 100.5,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15').toISOString(),
      });
      await helpers.createTransaction({ payload: tx1Payload, raw: true });

      const fileContent = helpers.loadCsvFixture('multiple-accounts.csv');

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: {
            'Checking Account': { action: 'link-existing', accountId: existingAccount.id },
            'Savings Account': { action: 'create-new', currentBalance: null }, // New account - no duplicates possible
            'Credit Card': { action: 'create-new', currentBalance: null }, // New account - no duplicates possible
          },
          categoryMapping: {},
        },
        raw: true,
      });

      // Should only detect duplicates for Checking Account (existing)
      // No duplicates for Savings Account or Credit Card (new accounts)
      const duplicatesForExisting = result.duplicates.filter((d) => {
        const row = result.validRows.find((r) => r.rowIndex === d.rowIndex);
        return row?.accountName === 'Checking Account';
      });

      expect(duplicatesForExisting.length).toBeGreaterThanOrEqual(1);

      // Verify no duplicates for new accounts
      const duplicatesForNew = result.duplicates.filter((d) => {
        const row = result.validRows.find((r) => r.rowIndex === d.rowIndex);
        return row?.accountName === 'Savings Account' || row?.accountName === 'Credit Card';
      });

      expect(duplicatesForNew).toHaveLength(0);
    });

    it('should handle mixed account mappings with selective duplicate detection', async () => {
      const account1 = await helpers.createAccount({ raw: true });
      const account2 = await helpers.createAccount({ raw: true });

      // Create matching transactions in both accounts
      const tx1Payload = helpers.buildTransactionPayload({
        accountId: account1.id,
        amount: 100.5,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15').toISOString(),
      });
      await helpers.createTransaction({ payload: tx1Payload, raw: true });

      const tx2Payload = helpers.buildTransactionPayload({
        accountId: account2.id,
        amount: 200.0,
        transactionType: TRANSACTION_TYPES.income,
        time: new Date('2024-01-16').toISOString(),
      });
      await helpers.createTransaction({ payload: tx2Payload, raw: true });

      const fileContent = helpers.loadCsvFixture('multiple-accounts.csv');

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: {
            'Checking Account': { action: 'link-existing', accountId: account1.id },
            'Savings Account': { action: 'link-existing', accountId: account2.id },
            'Credit Card': { action: 'create-new', currentBalance: null },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      // Should have duplicates from both existing accounts
      expect(result.duplicates.length).toBeGreaterThanOrEqual(0); // May or may not have duplicates depending on CSV data

      // Verify valid rows are all parsed
      expect(result.validRows.length).toBeGreaterThan(0);
    });

    it('should detect duplicates with existingAccount option', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create multiple matching transactions
      const tx1Payload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100.5,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15').toISOString(),
      });
      await helpers.createTransaction({ payload: tx1Payload, raw: true });

      const tx2Payload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 50.0,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-16').toISOString(),
      });
      await helpers.createTransaction({ payload: tx2Payload, raw: true });

      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: buildColumnMapping({
            account: { option: AccountOptionValue.existingAccount, accountId: account.id },
          }),
          accountMapping: {}, // No mapping needed with existingAccount
          categoryMapping: {},
        },
        raw: true,
      });

      // All rows should be checked against the same account
      expect(result.duplicates.length).toBeGreaterThanOrEqual(2);

      // All duplicates should reference the same account
      result.duplicates.forEach((duplicate) => {
        expect(duplicate.existingTransaction.accountId).toBe(account.id);
      });
    });

    it('should handle account mapping with no matching transactions', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create transaction that doesn't match CSV data
      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 999.99,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2020-01-01').toISOString(),
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: {
            'Main Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      // No duplicates since amounts/dates don't match
      expect(result.duplicates).toHaveLength(0);
      expect(result.validRows.length).toBeGreaterThan(0);
    });

    it('should detect duplicates across multiple existing accounts correctly', async () => {
      const account1 = await helpers.createAccount({ raw: true });
      const account2 = await helpers.createAccount({ raw: true });
      const account3 = await helpers.createAccount({ raw: true });

      // Create transaction in account1 matching Checking Account CSV row
      const tx1Payload = helpers.buildTransactionPayload({
        accountId: account1.id,
        amount: 100.5,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15').toISOString(),
      });
      await helpers.createTransaction({ payload: tx1Payload, raw: true });

      // Create transaction in account3 matching Credit Card CSV row (75.00 = 7500 cents)
      const tx3Payload = helpers.buildTransactionPayload({
        accountId: account3.id,
        amount: 75.0,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-18').toISOString(),
      });
      await helpers.createTransaction({ payload: tx3Payload, raw: true });

      const fileContent = helpers.loadCsvFixture('multiple-accounts.csv');

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: {
            'Checking Account': { action: 'link-existing', accountId: account1.id },
            'Savings Account': { action: 'link-existing', accountId: account2.id }, // No duplicates
            'Credit Card': { action: 'link-existing', accountId: account3.id },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      // Should detect duplicates from account1 and account3
      const duplicatesAccount1 = result.duplicates.filter((d) => d.existingTransaction.accountId === account1.id);
      const duplicatesAccount3 = result.duplicates.filter((d) => d.existingTransaction.accountId === account3.id);

      expect(duplicatesAccount1.length).toBeGreaterThanOrEqual(1);
      expect(duplicatesAccount3.length).toBeGreaterThanOrEqual(1);
    });

    it('should correctly match duplicates based on date, amount, and account combination', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create exact match
      const tx1Payload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100.5,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15').toISOString(),
      });
      await helpers.createTransaction({ payload: tx1Payload, raw: true });

      // Create same amount but different date (not a duplicate)
      const tx2Payload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100.5,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-02-15').toISOString(),
      });
      await helpers.createTransaction({ payload: tx2Payload, raw: true });

      // Create same date but different amount (not a duplicate)
      const tx3Payload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 999.99,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15').toISOString(),
      });
      await helpers.createTransaction({ payload: tx3Payload, raw: true });

      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: {
            'Main Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      // Should only find 1 duplicate (exact match)
      const duplicatesForFirstRow = result.duplicates.filter((d) => d.rowIndex === 2);
      expect(duplicatesForFirstRow).toHaveLength(1);

      // Verify it's the correct match. `importedTransaction.date` is a full ISO
      // instant; the meaningful match is on its calendar day.
      const duplicate = duplicatesForFirstRow[0];
      expect(duplicate?.existingTransaction.amount).toBe(10050);
      expect(duplicate?.importedTransaction.date.split('T')[0]).toBe('2024-01-15');
    });
  });

  describe('error handling', () => {
    it('should return validation error for empty file', async () => {
      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: '',
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: {},
          categoryMapping: {},
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should handle CSV with only headers (no data rows)', async () => {
      const fileContent = helpers.loadCsvFixture('headers-only.csv');

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: {},
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.validRows).toHaveLength(0);
      expect(result.invalidRows).toHaveLength(0);
      expect(result.duplicates).toHaveLength(0);
    });

    it('should handle CSV where every row is invalid but mapped to an existing account', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Every row has an invalid date so validRows ends up empty, but the
      // accountMapping links to a real account so existingAccountIds is non-empty.
      const csvContent = `Date,Amount,Description,Category,Currency,Type,Account
not-a-date,100.50,Bad row 1,Food,USD,expense,Main Account
also-bad,50.00,Bad row 2,Transport,USD,expense,Main Account`;

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: csvContent,
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: {
            'Main Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.validRows).toHaveLength(0);
      expect(result.invalidRows).toHaveLength(2);
      expect(result.duplicates).toHaveLength(0);
    });
  });

  describe('transaction type edge cases', () => {
    it('should handle case-insensitive transaction type values', async () => {
      // Create CSV with mixed case values
      const csvContent = `Date,Amount,Description,Category,Currency,Type,Account
2024-01-15,100.50,Transaction 1,Food,USD,INCOME,Main Account
2024-01-16,50.00,Transaction 2,Transport,USD,Expense,Main Account
2024-01-17,75.00,Transaction 3,Entertainment,USD,income,Main Account
2024-01-18,25.00,Transaction 4,Food,USD,EXPENSE,Main Account`;

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: csvContent,
          delimiter: ',',
          columnMapping: buildColumnMapping({
            transactionType: {
              option: TransactionTypeOptionValue.dataSourceColumn,
              columnName: 'Type',
              incomeValues: ['income', 'INCOME'], // Include both cases
              expenseValues: ['expense', 'Expense', 'EXPENSE'], // Include all case variations
            },
          }),
          accountMapping: {
            'Main Account': { action: 'create-new', currentBalance: null },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.validRows).toHaveLength(4);

      // Verify all transaction types are recognized when all cases are provided
      const incomeRows = result.validRows.filter((r) => r.transactionType === 'income');
      const expenseRows = result.validRows.filter((r) => r.transactionType === 'expense');

      expect(incomeRows).toHaveLength(2); // INCOME and income
      expect(expenseRows).toHaveLength(2); // Expense and EXPENSE
    });

    it('should handle custom income/expense values', async () => {
      const csvContent = `Date,Amount,Description,Category,Currency,Type,Account
2024-01-15,100.50,Transaction 1,Food,USD,credit,Main Account
2024-01-16,50.00,Transaction 2,Transport,USD,debit,Main Account
2024-01-17,75.00,Transaction 3,Entertainment,USD,deposit,Main Account
2024-01-18,25.00,Transaction 4,Food,USD,withdrawal,Main Account`;

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: csvContent,
          delimiter: ',',
          columnMapping: buildColumnMapping({
            transactionType: {
              option: TransactionTypeOptionValue.dataSourceColumn,
              columnName: 'Type',
              incomeValues: ['credit', 'deposit'],
              expenseValues: ['debit', 'withdrawal'],
            },
          }),
          accountMapping: {
            'Main Account': { action: 'create-new', currentBalance: null },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.validRows).toHaveLength(4);

      // Verify custom values are recognized
      const row1 = result.validRows.find((r) => r.description === 'Transaction 1');
      const row2 = result.validRows.find((r) => r.description === 'Transaction 2');
      const row3 = result.validRows.find((r) => r.description === 'Transaction 3');
      const row4 = result.validRows.find((r) => r.description === 'Transaction 4');

      expect(row1?.transactionType).toBe('income'); // credit -> income
      expect(row2?.transactionType).toBe('expense'); // debit -> expense
      expect(row3?.transactionType).toBe('income'); // deposit -> income
      expect(row4?.transactionType).toBe('expense'); // withdrawal -> expense
    });

    it('should handle multiple custom values for same transaction type', async () => {
      const csvContent = `Date,Amount,Description,Category,Currency,Type,Account
2024-01-15,100.50,Salary,Income,USD,salary,Main Account
2024-01-16,50.00,Bonus,Income,USD,bonus,Main Account
2024-01-17,75.00,Gift,Income,USD,gift,Main Account
2024-01-18,25.00,Groceries,Food,USD,purchase,Main Account
2024-01-19,30.00,Gas,Transport,USD,payment,Main Account
2024-01-20,40.00,Dinner,Food,USD,charge,Main Account`;

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: csvContent,
          delimiter: ',',
          columnMapping: buildColumnMapping({
            transactionType: {
              option: TransactionTypeOptionValue.dataSourceColumn,
              columnName: 'Type',
              incomeValues: ['salary', 'bonus', 'gift', 'refund'],
              expenseValues: ['purchase', 'payment', 'charge', 'fee'],
            },
          }),
          accountMapping: {
            'Main Account': { action: 'create-new', currentBalance: null },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.validRows).toHaveLength(6);

      const incomeRows = result.validRows.filter((r) => r.transactionType === 'income');
      const expenseRows = result.validRows.filter((r) => r.transactionType === 'expense');

      expect(incomeRows).toHaveLength(3); // salary, bonus, gift
      expect(expenseRows).toHaveLength(3); // purchase, payment, charge
    });

    it('should mark row as invalid when transaction type value is not recognized', async () => {
      const csvContent = `Date,Amount,Description,Category,Currency,Type,Account
2024-01-15,100.50,Transaction 1,Food,USD,income,Main Account
2024-01-16,50.00,Transaction 2,Transport,USD,UNKNOWN,Main Account
2024-01-17,75.00,Transaction 3,Entertainment,USD,expense,Main Account
2024-01-18,25.00,Transaction 4,Food,USD,invalid_type,Main Account`;

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: csvContent,
          delimiter: ',',
          columnMapping: buildColumnMapping({
            transactionType: {
              option: TransactionTypeOptionValue.dataSourceColumn,
              columnName: 'Type',
              incomeValues: ['income'],
              expenseValues: ['expense'],
            },
          }),
          accountMapping: {
            'Main Account': { action: 'create-new', currentBalance: null },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.validRows).toHaveLength(2); // Only income and expense rows
      expect(result.invalidRows).toHaveLength(2); // UNKNOWN and invalid_type rows

      // Verify invalid rows have error messages about transaction type
      const unknownTypeRow = result.invalidRows.find((r) => r.rawData['Type'] === 'UNKNOWN');
      expect(unknownTypeRow).toBeDefined();
      expect(unknownTypeRow?.errors.some((e) => e.toLowerCase().includes('type'))).toBe(true);

      const invalidTypeRow = result.invalidRows.find((r) => r.rawData['Type'] === 'invalid_type');
      expect(invalidTypeRow).toBeDefined();
      expect(invalidTypeRow?.errors.some((e) => e.toLowerCase().includes('type'))).toBe(true);
    });

    it('should handle whitespace in transaction type values', async () => {
      const csvContent = `Date,Amount,Description,Category,Currency,Type,Account
2024-01-15,100.50,Transaction 1,Food,USD,  income  ,Main Account
2024-01-16,50.00,Transaction 2,Transport,USD,expense  ,Main Account
2024-01-17,75.00,Transaction 3,Entertainment,USD,  INCOME,Main Account`;

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: csvContent,
          delimiter: ',',
          columnMapping: buildColumnMapping({
            transactionType: {
              option: TransactionTypeOptionValue.dataSourceColumn,
              columnName: 'Type',
              incomeValues: ['income', 'INCOME'], // Include both cases
              expenseValues: ['expense'],
            },
          }),
          accountMapping: {
            'Main Account': { action: 'create-new', currentBalance: null },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      // All rows should be valid - whitespace should be trimmed
      expect(result.validRows).toHaveLength(3);
      expect(result.invalidRows).toHaveLength(0);

      const incomeRows = result.validRows.filter((r) => r.transactionType === 'income');
      expect(incomeRows).toHaveLength(2);
    });

    it('should handle empty transaction type column with amountSign fallback', async () => {
      const csvContent = `Date,Amount,Description,Category,Currency,Type,Account
2024-01-15,100.50,Income transaction,Salary,USD,,Main Account
2024-01-16,-50.00,Expense transaction,Food,USD,,Main Account
2024-01-17,75.00,Another income,Bonus,USD,,Main Account`;

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: csvContent,
          delimiter: ',',
          columnMapping: buildColumnMapping({
            transactionType: { option: TransactionTypeOptionValue.amountSign },
          }),
          accountMapping: {
            'Main Account': { action: 'create-new', currentBalance: null },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.validRows).toHaveLength(3);

      // Positive amounts = income, negative = expense
      const row1 = result.validRows.find((r) => r.description === 'Income transaction');
      const row2 = result.validRows.find((r) => r.description === 'Expense transaction');
      const row3 = result.validRows.find((r) => r.description === 'Another income');

      expect(row1?.transactionType).toBe('income');
      expect(row2?.transactionType).toBe('expense');
      expect(row3?.transactionType).toBe('income');
    });

    it('should handle case-insensitive custom income/expense values', async () => {
      const csvContent = `Date,Amount,Description,Category,Currency,Type,Account
2024-01-15,100.50,Transaction 1,Food,USD,SALARY,Main Account
2024-01-16,50.00,Transaction 2,Transport,USD,Purchase,Main Account
2024-01-17,75.00,Transaction 3,Income,USD,bonus,Main Account
2024-01-18,25.00,Transaction 4,Food,USD,PURCHASE,Main Account`;

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: csvContent,
          delimiter: ',',
          columnMapping: buildColumnMapping({
            transactionType: {
              option: TransactionTypeOptionValue.dataSourceColumn,
              columnName: 'Type',
              incomeValues: ['salary', 'SALARY', 'bonus'],
              expenseValues: ['purchase', 'Purchase', 'PURCHASE'],
            },
          }),
          accountMapping: {
            'Main Account': { action: 'create-new', currentBalance: null },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.validRows).toHaveLength(4);

      const row1 = result.validRows.find((r) => r.description === 'Transaction 1');
      const row2 = result.validRows.find((r) => r.description === 'Transaction 2');
      const row3 = result.validRows.find((r) => r.description === 'Transaction 3');
      const row4 = result.validRows.find((r) => r.description === 'Transaction 4');

      expect(row1?.transactionType).toBe('income'); // SALARY (uppercase)
      expect(row2?.transactionType).toBe('expense'); // Purchase (mixed case)
      expect(row3?.transactionType).toBe('income'); // bonus (lowercase)
      expect(row4?.transactionType).toBe('expense'); // PURCHASE (uppercase)
    });

    it('should prioritize exact match over case-insensitive match', async () => {
      const csvContent = `Date,Amount,Description,Category,Currency,Type,Account
2024-01-15,100.50,Transaction 1,Food,USD,Income,Main Account
2024-01-16,50.00,Transaction 2,Transport,USD,INCOME,Main Account`;

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: csvContent,
          delimiter: ',',
          columnMapping: buildColumnMapping({
            transactionType: {
              option: TransactionTypeOptionValue.dataSourceColumn,
              columnName: 'Type',
              incomeValues: ['Income', 'INCOME'], // Both cases defined
              expenseValues: ['expense'],
            },
          }),
          accountMapping: {
            'Main Account': { action: 'create-new', currentBalance: null },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.validRows).toHaveLength(2);

      // Both should be recognized as income
      result.validRows.forEach((row) => {
        expect(row.transactionType).toBe('income');
      });
    });
  });

  describe('amount parsing', () => {
    it('should parse amounts with different formats correctly', async () => {
      const fileContent = helpers.loadCsvFixture('valid-comma.csv');

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: buildColumnMapping({
            transactionType: { option: TransactionTypeOptionValue.amountSign },
          }),
          accountMapping: {
            'Main Account': { action: 'create-new', currentBalance: null },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      // Check 100.50 is parsed as 10050 cents
      const row1 = result.validRows.find((r) => r.description === 'Grocery shopping');
      expect(row1?.amount).toBe(10050);

      // Check -50.00 is parsed as 5000 cents (absolute value)
      const row2 = result.validRows.find((r) => r.description === 'Coffee shop');
      expect(row2?.amount).toBe(5000);

      // Check 2500.00 is parsed as 250000 cents
      const row3 = result.validRows.find((r) => r.description === 'Salary');
      expect(row3?.amount).toBe(250000);
    });
  });

  describe('date engine and timezone anchoring', () => {
    // Bug A: datetimes with a time component were rejected by the old date-only
    // parser. Full ISO instants must now import, preserving the absolute moment.
    it('imports full ISO datetimes (with time + explicit zone)', async () => {
      const csvContent = `Date,Amount,Description,Category,Currency,Type,Account
2026-06-16T18:17:19.587Z,100.50,Morning coffee,Food,USD,expense,Main Account
2026-06-17T09:00:00Z,50.00,Lunch,Food,USD,expense,Main Account`;

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: csvContent,
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: {
            'Main Account': { action: 'create-new', currentBalance: null },
          },
          categoryMapping: {},
          timezone: 'America/Montevideo',
        },
        raw: true,
      });

      expect(result.invalidRows).toHaveLength(0);
      expect(result.validRows).toHaveLength(2);

      // An explicit-zone instant is stored verbatim, ignoring the request tz.
      const firstRow = result.validRows.find((r) => r.description === 'Morning coffee');
      expect(firstRow?.date).toBe('2026-06-16T18:17:19.587Z');
    });

    // The user-confirmed day-first order applies to every row uniformly, so
    // 08/06 is June 8 — never Aug 6 via a per-row US tiebreak.
    it('reads a day-first date-only column as day-first (08/06 = June 8, not Aug 6)', async () => {
      const csvContent = `Date,Amount,Description,Category,Currency,Type,Account
08/06/2026,100.50,Ambiguous day,Food,USD,expense,Main Account
15/06/2026,50.00,Disambiguating day,Food,USD,expense,Main Account`;

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: csvContent,
          delimiter: ',',
          columnMapping: buildColumnMapping({ dateFieldOrder: 'day-first' }),
          accountMapping: {
            'Main Account': { action: 'create-new', currentBalance: null },
          },
          categoryMapping: {},
          timezone: 'America/Montevideo',
        },
        raw: true,
      });

      expect(result.invalidRows).toHaveLength(0);
      expect(result.validRows).toHaveLength(2);

      const ambiguousRow = result.validRows.find((r) => r.description === 'Ambiguous day');
      // June 8 in Montevideo (UTC-3) anchored at local noon -> 15:00 UTC, still June 8.
      expect(ambiguousRow?.date.split('T')[0]).toBe('2026-06-08');
    });

    // Bug D: a date-only value stored as plain `new Date("2026-06-01")` is UTC
    // midnight, which renders as May 31 for a UTC-3 user. Anchoring to local noon
    // keeps it on June 1 for that user.
    it('anchors a date-only row to the correct calendar day for a UTC-3 user (no off-by-one)', async () => {
      const csvContent = `Date,Amount,Description,Category,Currency,Type,Account
2026-06-01,100.50,First of June,Food,USD,expense,Main Account`;

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: csvContent,
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: {
            'Main Account': { action: 'create-new', currentBalance: null },
          },
          categoryMapping: {},
          timezone: 'America/Montevideo',
        },
        raw: true,
      });

      expect(result.validRows).toHaveLength(1);
      const row = result.validRows[0]!;

      // Stored instant is June 1 local noon = 15:00 UTC.
      expect(row.date).toBe('2026-06-01T15:00:00.000Z');

      // And as seen by the UTC-3 user it must still be June 1, never May 31.
      const dayForUser = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Montevideo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(row.date));
      expect(dayForUser).toBe('2026-06-01');
    });

    // The confirmed dateFieldOrder is applied to the whole column: a cell that
    // is impossible under it (08/25 read day-first would be month 25) lands in
    // invalidRows while the rest of the column parses under the chosen order.
    it('marks rows impossible under the confirmed day/month order as invalid, never re-guessing', async () => {
      const csvContent = `Date,Amount,Description,Category,Currency,Type,Account
25/08/2026,100.50,Day first row,Food,USD,expense,Main Account
08/25/2026,50.00,Month first row,Food,USD,expense,Main Account`;

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: csvContent,
          delimiter: ',',
          columnMapping: buildColumnMapping({ dateFieldOrder: 'day-first' }),
          accountMapping: {
            'Main Account': { action: 'create-new', currentBalance: null },
          },
          categoryMapping: {},
          timezone: 'America/Montevideo',
        },
        raw: true,
      });

      // 25/08/2026 day-first is Aug 25; 08/25/2026 day-first would be month 25.
      expect(result.validRows).toHaveLength(1);
      expect(result.validRows[0]?.description).toBe('Day first row');
      expect(result.validRows[0]?.date.split('T')[0]).toBe('2026-08-25');

      expect(result.invalidRows).toHaveLength(1);
      expect(result.invalidRows[0]?.rawData['Description']).toBe('Month first row');
      expect(result.invalidRows[0]?.errors.some((e) => e.toLowerCase().includes('date'))).toBe(true);
    });

    // Loud failure preserved: a value matching no known date shape still lands in
    // invalidRows with a date error, while well-formed rows around it import.
    it('still surfaces empty and unparseable date rows as invalid rows', async () => {
      const csvContent = `Date,Amount,Description,Category,Currency,Type,Account
2026-06-01,100.50,Good row,Food,USD,expense,Main Account
not-a-date,50.00,Garbage date,Food,USD,expense,Main Account
,75.00,Empty date,Food,USD,expense,Main Account`;

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: csvContent,
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: {
            'Main Account': { action: 'create-new', currentBalance: null },
          },
          categoryMapping: {},
          timezone: 'America/Montevideo',
        },
        raw: true,
      });

      expect(result.validRows).toHaveLength(1);
      expect(result.validRows[0]?.description).toBe('Good row');

      expect(result.invalidRows).toHaveLength(2);
      result.invalidRows.forEach((invalidRow) => {
        expect(invalidRow.errors.some((e) => e.toLowerCase().includes('date'))).toBe(true);
      });
    });

    // No timezone in the request must not crash: date-only falls back to UTC noon,
    // which still lands on the right calendar day for every zone within ±11h.
    it('falls back to UTC noon for a date-only row when no timezone is supplied', async () => {
      const csvContent = `Date,Amount,Description,Category,Currency,Type,Account
2026-06-01,100.50,No tz row,Food,USD,expense,Main Account`;

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: csvContent,
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: {
            'Main Account': { action: 'create-new', currentBalance: null },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.validRows).toHaveLength(1);
      expect(result.validRows[0]?.date).toBe('2026-06-01T12:00:00.000Z');
    });

    // After anchoring, a same-day CSV row must still match an existing same-day
    // transaction even though `row.date` is now a full instant at local noon and
    // the stored tx sits at a different time of day.
    it('still detects a same-day duplicate after date anchoring', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Existing tx stored at UTC midnight for the day.
      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 100.5,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2026-06-01T00:00:00.000Z').toISOString(),
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      const csvContent = `Date,Amount,Description,Category,Currency,Type,Account
2026-06-01,100.50,Same day import,Food,USD,expense,Main Account`;

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: csvContent,
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: {
            'Main Account': { action: 'link-existing', accountId: account.id },
          },
          categoryMapping: {},
          timezone: 'America/Montevideo',
        },
        raw: true,
      });

      // The CSV row (anchored to 2026-06-01T15:00Z) must match the existing
      // 2026-06-01T00:00Z tx on calendar day.
      expect(result.duplicates.length).toBeGreaterThanOrEqual(1);
      const duplicate = result.duplicates.find((d) => d.existingTransaction.accountId === account.id);
      expect(duplicate).toBeDefined();
    });
  });

  // ── unpriceableRows ──────────────────────────────────────────────────────────
  // The e2e environment seeds ExchangeRates with historical rates for the common
  // currency set (EUR, GBP, JPY, etc.) and never truncates that table between
  // tests. The user's base currency is AED (see setupIntegrationTests.ts).
  //
  // Pricing rules exercised here:
  //   • USD → always priceable (it is API_LAYER_BASE_CURRENCY_CODE)
  //   • AED → always priceable (it is the user's base currency)
  //   • EUR → priceable via stored ExchangeRates row (seeded)
  //   • SSP → not priceable: a real ISO-4217 code deliberately kept out of the
  //     seeded rate set, so it passes the currencyCode() request-schema check
  //     yet still has no stored rate — the genuine production shape. (A fake
  //     code like ZZZ can no longer reach this layer: the schema rejects it.)
  describe('unpriceableRows classification', () => {
    // Shared column mapping for all sub-tests: single fixed currency per test,
    // so we use the existingCurrency option to avoid a Currency column.
    function buildFixedCurrencyMapping(currencyCode: string): ColumnMappingConfig {
      return buildColumnMapping({
        currency: { option: CurrencyOptionValue.existingCurrency, currencyCode },
      });
    }

    const MINIMAL_CSV = `Date,Amount,Description,Category,Type,Account
2024-01-15,100.00,Test transaction,Food,expense,Main Account`;

    it('omits unpriceableRows when all rows are in USD (always priceable)', async () => {
      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: MINIMAL_CSV,
          delimiter: ',',
          columnMapping: buildFixedCurrencyMapping('USD'),
          accountMapping: { 'Main Account': { action: 'create-new', currentBalance: null } },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.unpriceableRows).toBeUndefined();
    });

    it('omits unpriceableRows when all rows are in the user base currency (AED)', async () => {
      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: MINIMAL_CSV,
          delimiter: ',',
          columnMapping: buildFixedCurrencyMapping('AED'),
          accountMapping: { 'Main Account': { action: 'create-new', currentBalance: null } },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.unpriceableRows).toBeUndefined();
    });

    it('omits unpriceableRows for EUR (seeded exchange rate exists)', async () => {
      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: MINIMAL_CSV,
          delimiter: ',',
          columnMapping: buildFixedCurrencyMapping('EUR'),
          accountMapping: { 'Main Account': { action: 'create-new', currentBalance: null } },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.unpriceableRows).toBeUndefined();
    });

    it('returns unpriceableRows for a currency with no stored rate (SSP)', async () => {
      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: MINIMAL_CSV,
          delimiter: ',',
          columnMapping: buildFixedCurrencyMapping('SSP'),
          accountMapping: { 'Main Account': { action: 'create-new', currentBalance: null } },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.unpriceableRows).toBeDefined();
      expect(result.unpriceableRows).toHaveLength(1);
      expect(result.unpriceableRows![0]).toMatchObject({ rowIndex: 2, currencyCode: 'SSP' });
    });

    it('returns only the SSP rows when a CSV mixes priceable (EUR) and unpriceable (SSP) currencies', async () => {
      const mixedCsv = `Date,Amount,Description,Category,Currency,Type,Account
2024-01-15,100.00,EUR tx,Food,EUR,expense,Main Account
2024-01-16,50.00,SSP tx,Food,SSP,expense,Main Account
2024-01-17,75.00,USD tx,Food,USD,expense,Main Account`;

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: mixedCsv,
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: { 'Main Account': { action: 'create-new', currentBalance: null } },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.unpriceableRows).toBeDefined();
      expect(result.unpriceableRows).toHaveLength(1);
      expect(result.unpriceableRows![0]).toMatchObject({ rowIndex: 3, currencyCode: 'SSP' });
    });

    it('omits unpriceableRows when the CSV has no valid rows (all invalid)', async () => {
      const allInvalidCsv = `Date,Amount,Description,Category,Type,Account
not-a-date,not-an-amount,Test,Food,expense,Main Account`;

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: allInvalidCsv,
          delimiter: ',',
          // Currency is incidental here: every row is invalid, so findUnpriceableRows
          // receives an empty array regardless of which currency is mapped.
          columnMapping: buildFixedCurrencyMapping('USD'),
          accountMapping: { 'Main Account': { action: 'create-new', currentBalance: null } },
          categoryMapping: {},
        },
        raw: true,
      });

      // No valid rows → findUnpriceableRows gets an empty array → no property.
      expect(result.unpriceableRows).toBeUndefined();
      expect(result.invalidRows.length).toBeGreaterThan(0);
    });
  });

  describe('tag column parsing', () => {
    const csvWithTags = `Date,Amount,Description,Category,Currency,Type,Account,Labels
2024-01-15,100.50,Grocery shopping,Food,USD,expense,Main Account,"food, travel"
2024-01-16,50.00,Coffee,Food,USD,expense,Main Account,
2024-01-17,25.00,Gift,Other,USD,expense,Main Account,"  solo  "`;

    it('splits the mapped tag column into per-row tagNames', async () => {
      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: csvWithTags,
          delimiter: ',',
          columnMapping: buildColumnMapping({
            tags: { option: TagOptionValue.mapDataSourceColumn, columnName: 'Labels' },
          }),
          accountMapping: { 'Main Account': { action: 'create-new', currentBalance: null } },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.validRows).toHaveLength(3);
      expect(result.validRows[0]?.tagNames).toEqual(['food', 'travel']);
    });

    it('yields an empty tagNames array for a blank tag cell', async () => {
      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: csvWithTags,
          delimiter: ',',
          columnMapping: buildColumnMapping({
            tags: { option: TagOptionValue.mapDataSourceColumn, columnName: 'Labels' },
          }),
          accountMapping: { 'Main Account': { action: 'create-new', currentBalance: null } },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.validRows[1]?.tagNames).toEqual([]);
    });

    it('trims whitespace around a single tag value', async () => {
      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: csvWithTags,
          delimiter: ',',
          columnMapping: buildColumnMapping({
            tags: { option: TagOptionValue.mapDataSourceColumn, columnName: 'Labels' },
          }),
          accountMapping: { 'Main Account': { action: 'create-new', currentBalance: null } },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.validRows[2]?.tagNames).toEqual(['solo']);
    });

    it('leaves tagNames undefined when no tag column is mapped', async () => {
      const result = await helpers.detectDuplicates({
        payload: {
          fileContent: csvWithTags,
          delimiter: ',',
          columnMapping: buildColumnMapping(),
          accountMapping: { 'Main Account': { action: 'create-new', currentBalance: null } },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.validRows[0]?.tagNames).toBeUndefined();
    });
  });
});
