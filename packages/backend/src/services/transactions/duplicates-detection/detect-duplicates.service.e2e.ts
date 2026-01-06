import { TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';
import * as helpers from '@tests/helpers';

import { type TransactionToCheck, detectDuplicates } from './detect-duplicates.service';

describe('Generic Detect Duplicates Service', () => {
  /**
   * Helper to create transactions to check.
   */
  const createTransactionsToCheck = (overrides: Partial<TransactionToCheck>[] = []): TransactionToCheck[] => {
    const defaults: TransactionToCheck[] = [
      {
        date: '2024-01-15 10:30:00',
        amount: 10050,
        type: 'expense',
      },
      {
        date: '2024-01-16 14:20:00',
        amount: 5000,
        type: 'expense',
      },
      {
        date: '2024-01-17 09:00:00',
        amount: 250000,
        type: 'income',
      },
    ];

    return defaults.map((tx, i) => ({
      ...tx,
      ...(overrides[i] || {}),
    }));
  };

  describe('basic duplicate detection', () => {
    it('should return empty array when no transactions to check', async () => {
      const account = await helpers.createAccount({ raw: true });

      const result = await detectDuplicates({
        userId: account.userId,
        accountId: account.id,
        transactions: [],
      });

      expect(result).toEqual([]);
    });

    it('should return empty array when no existing transactions in account', async () => {
      const account = await helpers.createAccount({ raw: true });
      const transactions = createTransactionsToCheck();

      const result = await detectDuplicates({
        userId: account.userId,
        accountId: account.id,
        transactions,
      });

      expect(result).toHaveLength(0);
    });

    it('should return empty array when no matches found', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create transaction that doesn't match
      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 99999,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2020-01-01').toISOString(),
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      const transactions = createTransactionsToCheck();

      const result = await detectDuplicates({
        userId: account.userId,
        accountId: account.id,
        transactions,
      });

      expect(result).toHaveLength(0);
    });

    it('should detect duplicate when date + amount + type match', async () => {
      const account = await helpers.createAccount({ raw: true });

      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 10050,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15').toISOString(),
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      const transactions = createTransactionsToCheck();

      const result = await detectDuplicates({
        userId: account.userId,
        accountId: account.id,
        transactions,
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.index).toBe(0);
      expect(result[0]!.incoming.amount).toBe(10050);
      expect(result[0]!.existing.amount).toBe(10050);
    });

    it('should detect multiple duplicates', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create matching transactions
      const tx1 = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 10050,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15').toISOString(),
      });
      await helpers.createTransaction({ payload: tx1, raw: true });

      const tx2 = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 5000,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-16').toISOString(),
      });
      await helpers.createTransaction({ payload: tx2, raw: true });

      const tx3 = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 250000,
        transactionType: TRANSACTION_TYPES.income,
        time: new Date('2024-01-17').toISOString(),
      });
      await helpers.createTransaction({ payload: tx3, raw: true });

      const transactions = createTransactionsToCheck();

      const result = await detectDuplicates({
        userId: account.userId,
        accountId: account.id,
        transactions,
      });

      expect(result).toHaveLength(3);
      expect(result.map((d) => d.index).sort()).toEqual([0, 1, 2]);
    });
  });

  describe('matching criteria', () => {
    it('should NOT match when transaction type differs', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create INCOME with same date and amount as EXPENSE in check list
      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 10050,
        transactionType: TRANSACTION_TYPES.income, // Different type
        time: new Date('2024-01-15').toISOString(),
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      const transactions = createTransactionsToCheck();

      const result = await detectDuplicates({
        userId: account.userId,
        accountId: account.id,
        transactions,
      });

      expect(result).toHaveLength(0);
    });

    it('should NOT match when amount differs by 1 cent', async () => {
      const account = await helpers.createAccount({ raw: true });

      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 10051, // 1 cent difference
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15').toISOString(),
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      const transactions = createTransactionsToCheck();

      const result = await detectDuplicates({
        userId: account.userId,
        accountId: account.id,
        transactions,
      });

      expect(result).toHaveLength(0);
    });

    it('should NOT match when date differs by 1 day', async () => {
      const account = await helpers.createAccount({ raw: true });

      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 10050,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-14').toISOString(), // 1 day before
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      const transactions = createTransactionsToCheck();

      const result = await detectDuplicates({
        userId: account.userId,
        accountId: account.id,
        transactions,
      });

      expect(result).toHaveLength(0);
    });

    it('should match transactions on same day regardless of time', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create transaction at 23:59 on same day
      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 10050,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15T23:59:59').toISOString(),
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      // Check transaction at 10:30 on same day
      const transactions: TransactionToCheck[] = [{ date: '2024-01-15 10:30:00', amount: 10050, type: 'expense' }];

      const result = await detectDuplicates({
        userId: account.userId,
        accountId: account.id,
        transactions,
      });

      expect(result).toHaveLength(1);
    });

    it('should match using date-only format (YYYY-MM-DD)', async () => {
      const account = await helpers.createAccount({ raw: true });

      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 10050,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15T14:00:00').toISOString(),
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      // Check with date-only format
      const transactions: TransactionToCheck[] = [{ date: '2024-01-15', amount: 10050, type: 'expense' }];

      const result = await detectDuplicates({
        userId: account.userId,
        accountId: account.id,
        transactions,
      });

      expect(result).toHaveLength(1);
    });
  });

  describe('date range handling', () => {
    it('should correctly detect duplicates on the last day of range', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create transaction on the last date
      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 250000,
        transactionType: TRANSACTION_TYPES.income,
        time: new Date('2024-01-17T18:00:00').toISOString(),
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      const transactions = createTransactionsToCheck();

      const result = await detectDuplicates({
        userId: account.userId,
        accountId: account.id,
        transactions,
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.index).toBe(2); // Third transaction (income)
    });

    it('should handle transactions spanning multiple months', async () => {
      const account = await helpers.createAccount({ raw: true });

      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 2000,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-02-15').toISOString(),
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      const transactions: TransactionToCheck[] = [
        { date: '2024-01-31', amount: 1000, type: 'expense' },
        { date: '2024-02-15', amount: 2000, type: 'expense' },
        { date: '2024-03-01', amount: 3000, type: 'expense' },
      ];

      const result = await detectDuplicates({
        userId: account.userId,
        accountId: account.id,
        transactions,
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.index).toBe(1);
    });

    it('should handle single transaction at end of month', async () => {
      const account = await helpers.createAccount({ raw: true });

      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 5000,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-31T23:59:59').toISOString(),
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      const transactions: TransactionToCheck[] = [{ date: '2024-01-31 12:00:00', amount: 5000, type: 'expense' }];

      const result = await detectDuplicates({
        userId: account.userId,
        accountId: account.id,
        transactions,
      });

      expect(result).toHaveLength(1);
    });
  });

  describe('response structure', () => {
    it('should return correct DuplicateMatch structure', async () => {
      const account = await helpers.createAccount({ raw: true });

      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 10050,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15').toISOString(),
        note: 'Test note for matching',
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      const transactions = createTransactionsToCheck();

      const result = await detectDuplicates({
        userId: account.userId,
        accountId: account.id,
        transactions,
      });

      expect(result).toHaveLength(1);

      const match = result[0]!;

      // Check index
      expect(typeof match.index).toBe('number');
      expect(match.index).toBe(0);

      // Check incoming (preserves original transaction)
      expect(match.incoming).toEqual({
        date: '2024-01-15 10:30:00',
        amount: 10050,
        type: 'expense',
      });

      // Check existing
      expect(typeof match.existing.id).toBe('number');
      expect(match.existing.date).toBe('2024-01-15');
      expect(match.existing.amount).toBe(10050);
      expect(match.existing.note).toBe('Test note for matching');
    });

    it('should preserve generic type T in incoming field', async () => {
      const account = await helpers.createAccount({ raw: true });

      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 10050,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15').toISOString(),
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      // Extended type with extra fields
      interface ExtendedTransaction extends TransactionToCheck {
        customField: string;
        metadata: { source: string };
      }

      const transactions: ExtendedTransaction[] = [
        {
          date: '2024-01-15',
          amount: 10050,
          type: 'expense',
          customField: 'test-value',
          metadata: { source: 'bank-sync' },
        },
      ];

      const result = await detectDuplicates({
        userId: account.userId,
        accountId: account.id,
        transactions,
      });

      expect(result).toHaveLength(1);
      // Extra fields should be preserved
      expect(result[0]!.incoming.customField).toBe('test-value');
      expect(result[0]!.incoming.metadata).toEqual({ source: 'bank-sync' });
    });
  });

  describe('account isolation', () => {
    it('should only find duplicates in specified account', async () => {
      const account1 = await helpers.createAccount({ raw: true });
      const account2 = await helpers.createAccount({ raw: true });

      // Create transaction in account1
      const txPayload = helpers.buildTransactionPayload({
        accountId: account1.id,
        amount: 10050,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15').toISOString(),
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      const transactions = createTransactionsToCheck();

      // Check against account2
      const result = await detectDuplicates({
        userId: account2.userId,
        accountId: account2.id,
        transactions,
      });

      expect(result).toHaveLength(0);
    });

    it('should find correct duplicate when both accounts have similar transactions', async () => {
      const account1 = await helpers.createAccount({ raw: true });
      const account2 = await helpers.createAccount({ raw: true });

      // Create same transaction in both accounts
      const tx1 = helpers.buildTransactionPayload({
        accountId: account1.id,
        amount: 10050,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15').toISOString(),
        note: 'Account 1 transaction',
      });
      await helpers.createTransaction({ payload: tx1, raw: true });

      const tx2 = helpers.buildTransactionPayload({
        accountId: account2.id,
        amount: 10050,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15').toISOString(),
        note: 'Account 2 transaction',
      });
      await helpers.createTransaction({ payload: tx2, raw: true });

      const transactions = createTransactionsToCheck();

      // Check against account1
      const result1 = await detectDuplicates({
        userId: account1.userId,
        accountId: account1.id,
        transactions,
      });

      expect(result1).toHaveLength(1);
      expect(result1[0]!.existing.note).toBe('Account 1 transaction');

      // Check against account2
      const result2 = await detectDuplicates({
        userId: account2.userId,
        accountId: account2.id,
        transactions,
      });

      expect(result2).toHaveLength(1);
      expect(result2[0]!.existing.note).toBe('Account 2 transaction');
    });
  });

  describe('edge cases', () => {
    it('should handle large number of transactions efficiently', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create 10 existing transactions
      for (let i = 0; i < 10; i++) {
        const txPayload = helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 1000 * (i + 1),
          transactionType: TRANSACTION_TYPES.expense,
          time: new Date(`2024-01-${String(i + 1).padStart(2, '0')}`).toISOString(),
        });
        await helpers.createTransaction({ payload: txPayload, raw: true });
      }

      // Check 20 transactions (10 should match)
      const transactions: TransactionToCheck[] = [];
      for (let i = 0; i < 20; i++) {
        transactions.push({
          date: `2024-01-${String(i + 1).padStart(2, '0')}`,
          amount: 1000 * (i + 1),
          type: 'expense',
        });
      }

      const result = await detectDuplicates({
        userId: account.userId,
        accountId: account.id,
        transactions,
      });

      expect(result).toHaveLength(10);
    });

    it('should handle multiple transactions with same date/amount/type', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create two identical transactions in DB
      for (let i = 0; i < 2; i++) {
        const txPayload = helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 5000,
          transactionType: TRANSACTION_TYPES.expense,
          time: new Date('2024-01-15').toISOString(),
          note: `Transaction ${i + 1}`,
        });
        await helpers.createTransaction({ payload: txPayload, raw: true });
      }

      const transactions: TransactionToCheck[] = [{ date: '2024-01-15', amount: 5000, type: 'expense' }];

      const result = await detectDuplicates({
        userId: account.userId,
        accountId: account.id,
        transactions,
      });

      // Should return one match (uses first matching transaction)
      expect(result).toHaveLength(1);
    });

    it('should handle empty note in existing transaction', async () => {
      const account = await helpers.createAccount({ raw: true });

      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        amount: 10050,
        transactionType: TRANSACTION_TYPES.expense,
        time: new Date('2024-01-15').toISOString(),
        note: '', // Empty note
      });
      await helpers.createTransaction({ payload: txPayload, raw: true });

      const transactions = createTransactionsToCheck();

      const result = await detectDuplicates({
        userId: account.userId,
        accountId: account.id,
        transactions,
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.existing.note).toBe('');
    });

    it('should handle non-existent account gracefully', async () => {
      const account = await helpers.createAccount({ raw: true });
      const transactions = createTransactionsToCheck();

      const result = await detectDuplicates({
        userId: account.userId,
        accountId: 999999, // Non-existent
        transactions,
      });

      // Should return empty array (no transactions found)
      expect(result).toHaveLength(0);
    });
  });
});
