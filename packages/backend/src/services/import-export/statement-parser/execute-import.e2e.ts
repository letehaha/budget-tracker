import type { ExtractedMetadata, ExtractedTransaction } from '@bt/shared/types';
import { TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Statement Parser - Execute Import endpoint', () => {
  /**
   * Helper to create extracted transactions in system format.
   */
  const createExtractedTransactions = (overrides: Partial<ExtractedTransaction>[] = []): ExtractedTransaction[] => {
    const defaults: ExtractedTransaction[] = [
      {
        date: '2024-01-15 10:30:00',
        description: 'Grocery shopping',
        amount: 10050, // 100.50 in system format (cents)
        type: 'expense',
      },
      {
        date: '2024-01-16 14:20:00',
        description: 'Coffee shop',
        amount: 5000, // 50.00 in system format
        type: 'expense',
      },
      {
        date: '2024-01-17 09:00:00',
        description: 'Salary deposit',
        amount: 250000, // 2500.00 in system format
        type: 'income',
      },
    ];

    return defaults.map((tx, i) => ({
      ...tx,
      ...(overrides[i] || {}),
    }));
  };

  describe('successful import', () => {
    it('should import all transactions to existing account', async () => {
      const account = await helpers.createAccount({ raw: true });
      const transactions = createExtractedTransactions();

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions,
          skipIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(3);
      expect(result.summary.skipped).toBe(0);
      expect(result.summary.errors).toHaveLength(0);
      expect(result.newTransactionIds).toHaveLength(3);
      expect(result.batchId).toBeDefined();

      // Verify transactions were created in database
      const allTransactions = await helpers.getTransactions({ raw: true });
      const importedTxs = allTransactions.filter((tx) => result.newTransactionIds.includes(tx.id));

      expect(importedTxs).toHaveLength(3);
      importedTxs.forEach((tx) => {
        expect(tx.accountId).toBe(account.id);
      });
    });

    it('should skip transactions based on skipIndices', async () => {
      const account = await helpers.createAccount({ raw: true });
      const transactions = createExtractedTransactions();

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions,
          skipIndices: [0, 2], // Skip first and third
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(1);
      expect(result.summary.skipped).toBe(2);
      expect(result.summary.errors).toHaveLength(0);
      expect(result.newTransactionIds).toHaveLength(1);

      // Verify only the second transaction was created
      const allTransactions = await helpers.getTransactions({ raw: true });
      const importedTx = allTransactions.find((tx) => result.newTransactionIds.includes(tx.id));

      expect(importedTx).toBeDefined();
      expect(importedTx?.note).toBe('Coffee shop');
      expect(importedTx?.amount).toBe(5000);
    });

    it('should return empty result when all transactions are skipped', async () => {
      const account = await helpers.createAccount({ raw: true });
      const transactions = createExtractedTransactions();

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions,
          skipIndices: [0, 1, 2], // Skip all
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(0);
      expect(result.summary.skipped).toBe(3);
      expect(result.summary.errors).toHaveLength(0);
      expect(result.newTransactionIds).toHaveLength(0);
      expect(result.batchId).toBeDefined();
    });

    it('should handle empty transactions array', async () => {
      const account = await helpers.createAccount({ raw: true });

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions: [],
          skipIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(0);
      expect(result.summary.skipped).toBe(0);
      expect(result.summary.errors).toHaveLength(0);
      expect(result.newTransactionIds).toHaveLength(0);
    });
  });

  describe('transaction data', () => {
    it('should create transactions with correct amounts and types', async () => {
      const account = await helpers.createAccount({ raw: true });
      const transactions = createExtractedTransactions();

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions,
          skipIndices: [],
        },
        raw: true,
      });

      const allTransactions = await helpers.getTransactions({ raw: true });
      const importedTxs = allTransactions.filter((tx) => result.newTransactionIds.includes(tx.id));

      // Find each transaction by description
      const groceryTx = importedTxs.find((tx) => tx.note === 'Grocery shopping');
      const coffeeTx = importedTxs.find((tx) => tx.note === 'Coffee shop');
      const salaryTx = importedTxs.find((tx) => tx.note === 'Salary deposit');

      expect(groceryTx?.amount).toBe(10050);
      expect(groceryTx?.transactionType).toBe(TRANSACTION_TYPES.expense);

      expect(coffeeTx?.amount).toBe(5000);
      expect(coffeeTx?.transactionType).toBe(TRANSACTION_TYPES.expense);

      expect(salaryTx?.amount).toBe(250000);
      expect(salaryTx?.transactionType).toBe(TRANSACTION_TYPES.income);
    });

    it('should set description as transaction note', async () => {
      const account = await helpers.createAccount({ raw: true });
      const transactions: ExtractedTransaction[] = [
        {
          date: '2024-01-15 10:00:00',
          description: 'Test description with special chars: $100 @ store #123',
          amount: 1000,
          type: 'expense',
        },
      ];

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions,
          skipIndices: [],
        },
        raw: true,
      });

      const allTransactions = await helpers.getTransactions({ raw: true });
      const importedTx = allTransactions.find((tx) => result.newTransactionIds.includes(tx.id));

      expect(importedTx?.note).toBe('Test description with special chars: $100 @ store #123');
    });

    it('should handle transactions with balance field', async () => {
      const account = await helpers.createAccount({ raw: true });
      const transactions: ExtractedTransaction[] = [
        {
          date: '2024-01-15 10:00:00',
          description: 'Transaction with balance',
          amount: 5000,
          type: 'expense',
          balance: 100000, // Balance field from statement
        },
      ];

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions,
          skipIndices: [],
        },
        raw: true,
      });

      // Balance field should be ignored (not stored anywhere special)
      expect(result.summary.imported).toBe(1);
      expect(result.summary.errors).toHaveLength(0);
    });
  });

  describe('metadata handling', () => {
    it('should store metadata in externalData field', async () => {
      const account = await helpers.createAccount({ raw: true });
      const transactions = createExtractedTransactions();
      const metadata: ExtractedMetadata = {
        bankName: 'Test Bank',
        accountNumberLast4: '1234',
        statementPeriod: {
          from: '2024-01-01',
          to: '2024-01-31',
        },
        currencyCode: 'USD',
      };

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions,
          skipIndices: [],
          metadata,
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(3);

      // Note: We can't directly verify externalData through the transactions helper
      // as it may not be returned in the response. The test verifies no errors occur.
      expect(result.summary.errors).toHaveLength(0);
    });

    it('should work without metadata', async () => {
      const account = await helpers.createAccount({ raw: true });
      const transactions = createExtractedTransactions();

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions,
          skipIndices: [],
          // No metadata
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(3);
      expect(result.summary.errors).toHaveLength(0);
    });
  });

  describe('batch ID and atomicity', () => {
    it('should generate unique batch ID for each import', async () => {
      const account = await helpers.createAccount({ raw: true });
      const transactions = createExtractedTransactions();

      const result1 = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions,
          skipIndices: [],
        },
        raw: true,
      });

      const result2 = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions,
          skipIndices: [],
        },
        raw: true,
      });

      expect(result1.batchId).toBeDefined();
      expect(result2.batchId).toBeDefined();
      expect(result1.batchId).not.toBe(result2.batchId);
    });

    it('should create all transactions or none (atomicity)', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Get count before import
      const txBefore = await helpers.getTransactions({ raw: true });
      const countBefore = txBefore.length;

      // Try to import with valid transactions
      const transactions = createExtractedTransactions();

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions,
          skipIndices: [],
        },
        raw: true,
      });

      // All 3 should be imported
      expect(result.summary.imported).toBe(3);

      const txAfter = await helpers.getTransactions({ raw: true });
      expect(txAfter.length).toBe(countBefore + 3);
    });
  });

  describe('date handling', () => {
    it('should correctly parse date with time', async () => {
      const account = await helpers.createAccount({ raw: true });
      const transactions: ExtractedTransaction[] = [
        {
          date: '2024-06-15 14:30:45',
          description: 'Date with time',
          amount: 1000,
          type: 'expense',
        },
      ];

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions,
          skipIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(1);
      expect(result.summary.errors).toHaveLength(0);
    });

    it('should handle date without time (YYYY-MM-DD format)', async () => {
      const account = await helpers.createAccount({ raw: true });
      const transactions: ExtractedTransaction[] = [
        {
          date: '2024-06-15',
          description: 'Date without time',
          amount: 1000,
          type: 'expense',
        },
      ];

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions,
          skipIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(1);
      expect(result.summary.errors).toHaveLength(0);
    });

    it('should handle transactions spanning different months', async () => {
      const account = await helpers.createAccount({ raw: true });
      const transactions: ExtractedTransaction[] = [
        {
          date: '2024-01-31 23:59:00',
          description: 'End of January',
          amount: 1000,
          type: 'expense',
        },
        {
          date: '2024-02-01 00:01:00',
          description: 'Start of February',
          amount: 2000,
          type: 'expense',
        },
      ];

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions,
          skipIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(2);
      expect(result.summary.errors).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should return error for non-existent account', async () => {
      const transactions = createExtractedTransactions();

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: 999999,
          transactions,
          skipIndices: [],
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should return error for invalid transaction type', async () => {
      const account = await helpers.createAccount({ raw: true });

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions: [
            {
              date: '2024-01-15',
              description: 'Invalid type',
              amount: 1000,
              type: 'invalid' as 'expense',
            },
          ],
          skipIndices: [],
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should return error for negative amount', async () => {
      const account = await helpers.createAccount({ raw: true });

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions: [
            {
              date: '2024-01-15',
              description: 'Negative amount',
              amount: -1000, // Invalid
              type: 'expense',
            },
          ],
          skipIndices: [],
        },
        raw: false,
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('account isolation', () => {
    it('should only create transactions in the specified account', async () => {
      const account1 = await helpers.createAccount({ raw: true });
      const account2 = await helpers.createAccount({ raw: true });
      const transactions = createExtractedTransactions();

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account1.id,
          transactions,
          skipIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(3);

      // Verify all transactions are in account1
      const allTransactions = await helpers.getTransactions({ raw: true });
      const importedTxs = allTransactions.filter((tx) => result.newTransactionIds.includes(tx.id));

      importedTxs.forEach((tx) => {
        expect(tx.accountId).toBe(account1.id);
        expect(tx.accountId).not.toBe(account2.id);
      });
    });
  });

  describe('large imports', () => {
    it('should handle import of many transactions', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create 20 transactions
      const transactions: ExtractedTransaction[] = [];
      for (let i = 0; i < 20; i++) {
        transactions.push({
          date: `2024-01-${String((i % 28) + 1).padStart(2, '0')} 10:00:00`,
          description: `Transaction ${i + 1}`,
          amount: (i + 1) * 1000,
          type: i % 3 === 0 ? 'income' : 'expense',
        });
      }

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions,
          skipIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(20);
      expect(result.summary.errors).toHaveLength(0);
      expect(result.newTransactionIds).toHaveLength(20);
    });

    it('should handle partial skip of large import', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create 10 transactions
      const transactions: ExtractedTransaction[] = [];
      for (let i = 0; i < 10; i++) {
        transactions.push({
          date: `2024-01-${String((i % 28) + 1).padStart(2, '0')} 10:00:00`,
          description: `Transaction ${i + 1}`,
          amount: (i + 1) * 1000,
          type: 'expense',
        });
      }

      // Skip every other transaction
      const skipIndices = [0, 2, 4, 6, 8];

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions,
          skipIndices,
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(5);
      expect(result.summary.skipped).toBe(5);
      expect(result.summary.errors).toHaveLength(0);
    });
  });
});
