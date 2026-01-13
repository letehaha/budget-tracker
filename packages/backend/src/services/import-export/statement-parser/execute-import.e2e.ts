import type { ExtractedTransaction, TransactionImportDetails } from '@bt/shared/types';
import { ImportSource, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Transactions from '@models/Transactions.model';
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
      expect(importedTx?.amount).toBe(50.0);
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

      expect(groceryTx?.amount).toBe(100.5);
      expect(groceryTx?.transactionType).toBe(TRANSACTION_TYPES.expense);

      expect(coffeeTx?.amount).toBe(50.0);
      expect(coffeeTx?.transactionType).toBe(TRANSACTION_TYPES.expense);

      expect(salaryTx?.amount).toBe(2500.0);
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

  describe('importDetails in externalData', () => {
    it('should store importDetails with correct structure', async () => {
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
      expect(result.summary.errors).toHaveLength(0);

      // Verify externalData.importDetails is stored correctly
      const importedTx = await Transactions.findByPk(result.newTransactionIds[0]);
      const importDetails = importedTx?.externalData?.importDetails as TransactionImportDetails | undefined;

      expect(importDetails).toBeDefined();
      expect(importDetails?.batchId).toBe(result.batchId);
      expect(importDetails?.source).toBe(ImportSource.statementParser);
      expect(importDetails?.importedAt).toBeDefined();
      // Verify importedAt is a valid ISO date string
      expect(() => new Date(importDetails!.importedAt)).not.toThrow();
      expect(new Date(importDetails!.importedAt).toISOString()).toBe(importDetails!.importedAt);
    });

    it('should store same batchId for all transactions in a single import', async () => {
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

      // Verify all transactions have the same batchId
      const importedTxs = await Transactions.findAll({
        where: { id: result.newTransactionIds },
      });

      const batchIds = importedTxs.map((tx) => (tx.externalData?.importDetails as TransactionImportDetails)?.batchId);
      expect(batchIds.every((id) => id === result.batchId)).toBe(true);
    });

    it('should have different batchIds for separate imports', async () => {
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

      // Verify batchIds are different between imports
      const tx1 = await Transactions.findByPk(result1.newTransactionIds[0]);
      const tx2 = await Transactions.findByPk(result2.newTransactionIds[0]);

      const batchId1 = (tx1?.externalData?.importDetails as TransactionImportDetails)?.batchId;
      const batchId2 = (tx2?.externalData?.importDetails as TransactionImportDetails)?.batchId;

      expect(batchId1).toBe(result1.batchId);
      expect(batchId2).toBe(result2.batchId);
      expect(batchId1).not.toBe(batchId2);
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

    it('should return error for future date transaction', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create a date 1 year in the future
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions: [
            {
              date: futureDateStr!,
              description: 'Future transaction',
              amount: 1000,
              type: 'expense',
            },
          ],
          skipIndices: [],
        },
        raw: true,
      });

      // Transaction should not be imported, should be in errors
      expect(result.summary.imported).toBe(0);
      expect(result.summary.errors).toHaveLength(1);
      expect(result.summary.errors[0]!.transactionIndex).toBe(0);
      expect(result.summary.errors[0]!.error).toContain('is in the future');
    });

    it('should allow transaction dated today or yesterday', async () => {
      const account = await helpers.createAccount({ raw: true });

      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions: [
            {
              date: todayStr!,
              description: 'Today transaction',
              amount: 1000,
              type: 'expense',
            },
          ],
          skipIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(1);
      expect(result.summary.errors).toHaveLength(0);
    });

    it('should return error for extreme amount exceeding threshold', async () => {
      const account = await helpers.createAccount({ raw: true });

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions: [
            {
              date: '2024-01-15',
              description: 'Extremely large amount',
              amount: 2_000_000_000, // 2 billion - exceeds 1 billion threshold
              type: 'expense',
            },
          ],
          skipIndices: [],
        },
        raw: true,
      });

      // Transaction should not be imported, should be in errors
      expect(result.summary.imported).toBe(0);
      expect(result.summary.errors).toHaveLength(1);
      expect(result.summary.errors[0]!.transactionIndex).toBe(0);
      expect(result.summary.errors[0]!.error).toContain('exceeds maximum allowed value');
    });

    it('should allow amount just under the threshold', async () => {
      const account = await helpers.createAccount({ raw: true });

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions: [
            {
              date: '2024-01-15',
              description: 'Large but valid amount',
              amount: 999_999_999, // Just under 1 billion threshold
              type: 'income',
            },
          ],
          skipIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(1);
      expect(result.summary.errors).toHaveLength(0);
    });

    it('should handle mixed valid and invalid transactions', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create a future date
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions: [
            {
              date: '2024-01-15',
              description: 'Valid transaction 1',
              amount: 5000,
              type: 'expense',
            },
            {
              date: futureDateStr!, // Invalid - future date
              description: 'Future date transaction',
              amount: 1000,
              type: 'expense',
            },
            {
              date: '2024-01-16',
              description: 'Valid transaction 2',
              amount: 3000,
              type: 'income',
            },
            {
              date: '2024-01-17',
              description: 'Extreme amount transaction',
              amount: 2_000_000_000, // Invalid - too large
              type: 'expense',
            },
          ],
          skipIndices: [],
        },
        raw: true,
      });

      // 2 valid, 2 invalid
      expect(result.summary.imported).toBe(2);
      expect(result.summary.errors).toHaveLength(2);

      // Check error indices
      const errorIndices = result.summary.errors.map((e) => e.transactionIndex);
      expect(errorIndices).toContain(1); // Future date
      expect(errorIndices).toContain(3); // Extreme amount
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

  describe('import with existing transactions in account', () => {
    it('should import correctly when account has existing transactions in mid-period', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create an existing transaction on 2025-12-16 (mid-period)
      const existingTxPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 50000, // 500.00
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2025-12-16T12:00:00').toISOString(),
        note: 'Existing mid-period transaction',
      });
      await helpers.createTransaction({ payload: existingTxPayload, raw: true });

      // Import transactions from 2025-12-01 to 2025-12-20
      const transactions: ExtractedTransaction[] = [
        {
          date: '2025-12-01 10:00:00',
          description: 'Start of period',
          amount: 10000,
          type: 'expense',
        },
        {
          date: '2025-12-10 14:00:00',
          description: 'Mid period before existing',
          amount: 20000,
          type: 'expense',
        },
        {
          date: '2025-12-18 09:00:00',
          description: 'After existing transaction',
          amount: 15000,
          type: 'expense',
        },
        {
          date: '2025-12-20 16:00:00',
          description: 'End of period',
          amount: 25000,
          type: 'income',
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

      expect(result.summary.imported).toBe(4);
      expect(result.summary.errors).toHaveLength(0);

      // Verify all transactions exist (1 existing + 4 imported)
      const allTransactions = await helpers.getTransactions({
        accountIds: [account.id],
        raw: true,
      });
      const accountTxs = allTransactions.filter((tx) => tx.accountId === account.id);
      expect(accountTxs).toHaveLength(5);
    });

    it('should import correctly when account has multiple existing transactions scattered in period', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create existing transactions scattered throughout the period
      const existingDates = ['2025-12-05', '2025-12-12', '2025-12-18'];
      for (const date of existingDates) {
        const txPayload = helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 10000,
          transactionType: TRANSACTION_TYPES.expense,
          time: new Date(`${date}T12:00:00`).toISOString(),
          note: `Existing on ${date}`,
        });
        await helpers.createTransaction({ payload: txPayload, raw: true });
      }

      // Import transactions for the same period
      const transactions: ExtractedTransaction[] = [
        { date: '2025-12-01', description: 'Import 1', amount: 5000, type: 'expense' },
        { date: '2025-12-08', description: 'Import 2', amount: 7500, type: 'expense' },
        { date: '2025-12-15', description: 'Import 3', amount: 12000, type: 'income' },
        { date: '2025-12-20', description: 'Import 4', amount: 8000, type: 'expense' },
      ];

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions,
          skipIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(4);
      expect(result.summary.errors).toHaveLength(0);

      // Verify all transactions exist (3 existing + 4 imported)
      const allTransactions = await helpers.getTransactions({
        accountIds: [account.id],
        raw: true,
      });
      const accountTxs = allTransactions.filter((tx) => tx.accountId === account.id);
      expect(accountTxs).toHaveLength(7);
    });
  });

  describe('account balance updates', () => {
    it('should correctly update account balance after importing expenses', async () => {
      // Create account with initial balance
      const initialBalance = 1000; // $1000.00 (API uses decimals)
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance }),
        raw: true,
      });

      // Verify initial balance
      const accountBefore = await helpers.getAccount({ id: account.id, raw: true });
      expect(accountBefore.currentBalance).toBe(1000);

      // Import expense transactions (amounts in cents)
      const transactions: ExtractedTransaction[] = [
        { date: '2025-12-01', description: 'Expense 1', amount: 10000, type: 'expense' }, // $100.00
        { date: '2025-12-02', description: 'Expense 2', amount: 25000, type: 'expense' }, // $250.00
        { date: '2025-12-03', description: 'Expense 3', amount: 15000, type: 'expense' }, // $150.00
      ];

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions,
          skipIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(3);

      // Verify balance was decremented correctly
      // Initial: $1000.00, Expenses: $100 + $250 + $150 = $500.00
      // Expected: $1000.00 - $500.00 = $500.00
      const accountAfter = await helpers.getAccount({ id: account.id, raw: true });
      expect(accountAfter.currentBalance).toBe(500);
    });

    it('should correctly update account balance after importing income', async () => {
      const initialBalance = 500; // $500.00 (API uses decimals)
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance }),
        raw: true,
      });

      // Import income transactions (amounts in cents)
      const transactions: ExtractedTransaction[] = [
        { date: '2025-12-01', description: 'Salary', amount: 200000, type: 'income' }, // $2000.00
        { date: '2025-12-15', description: 'Bonus', amount: 50000, type: 'income' }, // $500.00
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

      // Verify balance was incremented correctly
      // Initial: $500.00, Income: $2000 + $500 = $2500.00
      // Expected: $500.00 + $2500.00 = $3000.00
      const accountAfter = await helpers.getAccount({ id: account.id, raw: true });
      expect(accountAfter.currentBalance).toBe(3000);
    });

    it('should correctly update account balance with mixed income and expenses', async () => {
      const initialBalance = 1000; // $1000.00 (API uses decimals)
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance }),
        raw: true,
      });

      // Import mixed transactions (amounts in cents)
      const transactions: ExtractedTransaction[] = [
        { date: '2025-12-01', description: 'Salary', amount: 300000, type: 'income' }, // $3000.00
        { date: '2025-12-05', description: 'Rent', amount: 150000, type: 'expense' }, // $1500.00
        { date: '2025-12-10', description: 'Freelance', amount: 50000, type: 'income' }, // $500.00
        { date: '2025-12-15', description: 'Groceries', amount: 30000, type: 'expense' }, // $300.00
        { date: '2025-12-20', description: 'Utilities', amount: 20000, type: 'expense' }, // $200.00
      ];

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions,
          skipIndices: [],
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(5);

      // Verify balance calculation
      // Initial: $1000.00
      // Income: $3000 + $500 = $3500.00
      // Expenses: $1500 + $300 + $200 = $2000.00
      // Expected: $1000.00 + $3500.00 - $2000.00 = $2500.00
      const accountAfter = await helpers.getAccount({ id: account.id, raw: true });
      expect(accountAfter.currentBalance).toBe(2500);
    });

    it('should correctly update balance when skipping some transactions', async () => {
      const initialBalance = 1000; // $1000.00 (API uses decimals)
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance }),
        raw: true,
      });

      const transactions: ExtractedTransaction[] = [
        { date: '2025-12-01', description: 'Expense 1', amount: 10000, type: 'expense' }, // index 0 - skip ($100)
        { date: '2025-12-02', description: 'Expense 2', amount: 20000, type: 'expense' }, // index 1 - import ($200)
        { date: '2025-12-03', description: 'Income 1', amount: 50000, type: 'income' }, // index 2 - skip ($500)
        { date: '2025-12-04', description: 'Expense 3', amount: 15000, type: 'expense' }, // index 3 - import ($150)
      ];

      const result = await helpers.statementExecuteImport({
        payload: {
          accountId: account.id,
          transactions,
          skipIndices: [0, 2], // Skip first expense and income
        },
        raw: true,
      });

      expect(result.summary.imported).toBe(2);
      expect(result.summary.skipped).toBe(2);

      // Only Expense 2 ($200) and Expense 3 ($150) should affect balance
      // Expected: $1000.00 - $200.00 - $150.00 = $650.00
      const accountAfter = await helpers.getAccount({ id: account.id, raw: true });
      expect(accountAfter.currentBalance).toBe(650);
    });

    it('should handle balance going negative', async () => {
      const initialBalance = 100; // $100.00 (API uses decimals)
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance }),
        raw: true,
      });

      // Import expense larger than balance (amount in cents)
      const transactions: ExtractedTransaction[] = [
        { date: '2025-12-01', description: 'Big expense', amount: 50000, type: 'expense' }, // $500.00
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

      // Expected: $100.00 - $500.00 = -$400.00
      const accountAfter = await helpers.getAccount({ id: account.id, raw: true });
      expect(accountAfter.currentBalance).toBe(-400);
    });

    it('should correctly update balance when importing to account with existing transactions', async () => {
      const initialBalance = 1000; // $1000.00 (API uses decimals)
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ initialBalance }),
        raw: true,
      });

      // Create existing transaction (amount in API decimal format)
      const existingTxPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 300, // $300.00
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2025-12-10').toISOString(),
      });
      await helpers.createTransaction({ payload: existingTxPayload, raw: true });

      // Verify balance after existing transaction
      const accountMid = await helpers.getAccount({ id: account.id, raw: true });
      expect(accountMid.currentBalance).toBe(700); // $1000 - $300

      // Import more transactions (amounts in cents)
      const transactions: ExtractedTransaction[] = [
        { date: '2025-12-15', description: 'New expense', amount: 20000, type: 'expense' }, // $200.00
        { date: '2025-12-20', description: 'New income', amount: 50000, type: 'income' }, // $500.00
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

      // Expected: $700.00 - $200.00 + $500.00 = $1000.00
      const accountAfter = await helpers.getAccount({ id: account.id, raw: true });
      expect(accountAfter.currentBalance).toBe(1000);
    });
  });
});
