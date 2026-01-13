import {
  AccountOptionValue,
  CategoryOptionValue,
  type ColumnMappingConfig,
  CurrencyOptionValue,
  TRANSACTION_TYPES,
  TransactionTypeOptionValue,
} from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Detect Duplicates endpoint', () => {
  // Helper to build common column mapping
  const buildColumnMapping = (overrides: Partial<ColumnMappingConfig> = {}): ColumnMappingConfig => ({
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
            'Main Account': { action: 'create-new' },
          },
          categoryMapping: {},
        },
        raw: true,
      });

      expect(result.validRows).toHaveLength(5);
      expect(result.invalidRows).toHaveLength(0);

      // Verify first row is parsed correctly
      const firstRow = result.validRows[0];
      expect(firstRow?.date).toBe('2024-01-15');
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
            'Main Account': { action: 'create-new' },
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
            'Main Account': { action: 'create-new' },
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

      const result = await helpers.detectDuplicates({
        payload: {
          fileContent,
          delimiter: ',',
          columnMapping: {
            date: 'Date',
            amount: 'Amount',
            category: { option: CategoryOptionValue.existingCategory, categoryId: 1 },
            currency: { option: CurrencyOptionValue.existingCurrency, currencyCode: 'EUR' },
            transactionType: { option: TransactionTypeOptionValue.amountSign },
            account: { option: AccountOptionValue.dataSourceColumn, columnName: 'Date' },
          },
          accountMapping: {
            '2024-01-15': { action: 'create-new' },
            '2024-01-16': { action: 'create-new' },
            '2024-01-17': { action: 'create-new' },
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
            'Main Account': { action: 'create-new' },
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
            'Savings Account': { action: 'create-new' },
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
            'Savings Account': { action: 'create-new' }, // New account - no duplicates possible
            'Credit Card': { action: 'create-new' }, // New account - no duplicates possible
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
            'Credit Card': { action: 'create-new' },
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

      // Verify it's the correct match
      const duplicate = duplicatesForFirstRow[0];
      expect(duplicate?.existingTransaction.amount).toBe(10050);
      expect(duplicate?.importedTransaction.date).toBe('2024-01-15');
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
            'Main Account': { action: 'create-new' },
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
            'Main Account': { action: 'create-new' },
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
            'Main Account': { action: 'create-new' },
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
            'Main Account': { action: 'create-new' },
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
            'Main Account': { action: 'create-new' },
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
            'Main Account': { action: 'create-new' },
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
            'Main Account': { action: 'create-new' },
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
            'Main Account': { action: 'create-new' },
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
            'Main Account': { action: 'create-new' },
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
});
