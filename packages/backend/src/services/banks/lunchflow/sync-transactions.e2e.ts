import { ACCOUNT_TYPES, TRANSACTION_TYPES } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import {
  getMockedLunchflowAccounts,
  getMockedLunchflowBalance,
  getMockedLunchflowTransactions,
} from '@tests/mocks/lunchflow/data';
import {
  resetLunchflowMocks,
  setMockedLunchflowAccounts,
  setMockedLunchflowBalance,
  setMockedLunchflowTransactions,
} from '@tests/mocks/lunchflow/mock-api';

describe('Lunchflow Sync Transactions', () => {
  beforeEach(() => {
    resetLunchflowMocks();
  });

  describe('Initial transaction sync', () => {
    it('successfully syncs transactions for an account', async () => {
      // Setup
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(1);
      setMockedLunchflowAccounts(mockedAccounts);
      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(5000));

      // Mock 10 transactions
      const mockedTransactions = getMockedLunchflowTransactions(mockedAccounts[0]!.id, 10);
      setMockedLunchflowTransactions(mockedAccounts[0]!.id, mockedTransactions);

      // Sync account first
      const syncResult = await helpers.lunchflow.syncAccounts({ raw: true });
      const account = syncResult.accounts[0]!;

      // Sync transactions
      const result = await helpers.lunchflow.syncTransactions({ accountId: account.id, raw: true });

      expect(result.new).toBe(10);
      expect(result.total).toBe(10);
      expect(result.message).toContain('10 new transaction(s)');

      // Verify transactions were created
      const allTransactions = await helpers.getTransactions({ raw: true });
      const lunchflowTransactions = allTransactions.filter((tx) => tx.accountId === account.id);

      expect(lunchflowTransactions).toHaveLength(10);
    });

    it('correctly creates income and expense transactions', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(1);
      setMockedLunchflowAccounts(mockedAccounts);

      // Create specific transactions with known amounts
      const specificTransactions = [
        {
          id: 'tx-income-1',
          accountId: mockedAccounts[0]!.id,
          amount: 500.5, // Positive = income
          currency: 'PLN',
          date: new Date().toISOString().split('T')[0]!,
          merchant: 'Employer',
          description: 'Salary',
        },
        {
          id: 'tx-expense-1',
          accountId: mockedAccounts[0]!.id,
          amount: -75.25, // Negative = expense
          currency: 'PLN',
          date: new Date().toISOString().split('T')[0]!,
          merchant: 'Grocery Store',
          description: 'Groceries',
        },
      ];

      setMockedLunchflowTransactions(mockedAccounts[0]!.id, specificTransactions);

      const syncResult = await helpers.lunchflow.syncAccounts({ raw: true });
      const account = syncResult.accounts[0]!;

      await helpers.lunchflow.syncTransactions({ accountId: account.id, raw: true });

      const allTransactions = await helpers.getTransactions({ raw: true });
      const lunchflowTransactions = allTransactions.filter((tx) => tx.accountId === account.id);

      const incomeTx = lunchflowTransactions.find((tx) => tx.originalId === 'tx-income-1');
      expect(incomeTx).toBeDefined();
      expect(incomeTx!.transactionType).toBe(TRANSACTION_TYPES.income);
      expect(incomeTx!.amount).toBe(50050); // 500.50 * 100 as absolute value

      const expenseTx = lunchflowTransactions.find((tx) => tx.originalId === 'tx-expense-1');
      expect(expenseTx).toBeDefined();
      expect(expenseTx!.transactionType).toBe(TRANSACTION_TYPES.expense);
      expect(expenseTx!.amount).toBe(7525); // 75.25 * 100 as absolute value
    });

    it('assigns default category to all transactions', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(1);
      setMockedLunchflowAccounts(mockedAccounts);
      const mockedTransactions = getMockedLunchflowTransactions(mockedAccounts[0]!.id, 5);
      setMockedLunchflowTransactions(mockedAccounts[0]!.id, mockedTransactions);

      const syncResult = await helpers.lunchflow.syncAccounts({ raw: true });
      const account = syncResult.accounts[0]!;

      await helpers.lunchflow.syncTransactions({ accountId: account.id, raw: true });

      const allTransactions = await helpers.getTransactions({ raw: true });
      const lunchflowTransactions = allTransactions.filter((tx) => tx.accountId === account.id);

      // All transactions should have a categoryId (user's default)
      lunchflowTransactions.forEach((tx) => {
        expect(tx.categoryId).toBeDefined();
        expect(tx.categoryId).toBeGreaterThan(0);
      });
    });
  });

  describe('Re-syncing transactions', () => {
    it('does not duplicate existing transactions on resync', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(1);
      setMockedLunchflowAccounts(mockedAccounts);
      const mockedTransactions = getMockedLunchflowTransactions(mockedAccounts[0]!.id, 10);
      setMockedLunchflowTransactions(mockedAccounts[0]!.id, mockedTransactions);

      const syncResult = await helpers.lunchflow.syncAccounts({ raw: true });
      const account = syncResult.accounts[0]!;

      // First sync
      const result1 = await helpers.lunchflow.syncTransactions({ accountId: account.id, raw: true });
      expect(result1.new).toBe(10);
      expect(result1.total).toBe(10);

      // Second sync with same transactions
      const result2 = await helpers.lunchflow.syncTransactions({ accountId: account.id, raw: true });
      expect(result2.new).toBe(0); // No new transactions
      expect(result2.total).toBe(10); // Still 10 total

      // Verify no duplicates
      const allTransactions = await helpers.getTransactions({ raw: true });
      const lunchflowTransactions = allTransactions.filter((tx) => tx.accountId === account.id);
      expect(lunchflowTransactions).toHaveLength(10);
    });

    it('syncs only new transactions when additional transactions are added', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(1);
      setMockedLunchflowAccounts(mockedAccounts);

      // Initial 5 transactions
      const initialTransactions = getMockedLunchflowTransactions(mockedAccounts[0]!.id, 5);
      setMockedLunchflowTransactions(mockedAccounts[0]!.id, initialTransactions);

      const syncResult = await helpers.lunchflow.syncAccounts({ raw: true });
      const account = syncResult.accounts[0]!;

      // First sync
      const result1 = await helpers.lunchflow.syncTransactions({ accountId: account.id, raw: true });
      expect(result1.new).toBe(5);

      // Add 3 more transactions
      const additionalTransactions = [
        {
          id: 'new-tx-1',
          accountId: mockedAccounts[0]!.id,
          amount: -100,
          currency: 'PLN',
          date: new Date().toISOString().split('T')[0]!,
          merchant: 'Store',
          description: 'Purchase',
        },
        {
          id: 'new-tx-2',
          accountId: mockedAccounts[0]!.id,
          amount: 200,
          currency: 'PLN',
          date: new Date().toISOString().split('T')[0]!,
          merchant: 'Income',
          description: 'Payment',
        },
        {
          id: 'new-tx-3',
          accountId: mockedAccounts[0]!.id,
          amount: -50,
          currency: 'PLN',
          date: new Date().toISOString().split('T')[0]!,
          merchant: 'Cafe',
          description: 'Coffee',
        },
      ];

      setMockedLunchflowTransactions(mockedAccounts[0]!.id, [...initialTransactions, ...additionalTransactions]);

      // Second sync
      const result2 = await helpers.lunchflow.syncTransactions({ accountId: account.id, raw: true });
      expect(result2.new).toBe(3); // Only 3 new transactions
      expect(result2.total).toBe(8); // Total of 8

      const allTransactions = await helpers.getTransactions({ raw: true });
      const lunchflowTransactions = allTransactions.filter((tx) => tx.accountId === account.id);
      expect(lunchflowTransactions).toHaveLength(8);
    });
  });

  describe('Transaction data handling', () => {
    it('stores transaction metadata correctly', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(1);
      setMockedLunchflowAccounts(mockedAccounts);

      const specificTransaction = {
        id: 'tx-test-123',
        accountId: mockedAccounts[0]!.id,
        amount: -150.75,
        currency: 'PLN',
        date: '2025-01-15',
        merchant: 'Test Merchant',
        description: 'Test Description',
      };

      setMockedLunchflowTransactions(mockedAccounts[0]!.id, [specificTransaction]);

      const syncResult = await helpers.lunchflow.syncAccounts({ raw: true });
      const account = syncResult.accounts[0]!;

      await helpers.lunchflow.syncTransactions({ accountId: account.id, raw: true });

      const allTransactions = await helpers.getTransactions({ raw: true });
      const transaction = allTransactions.find((tx) => tx.originalId === 'tx-test-123');

      expect(transaction).toBeDefined();
      expect(transaction!.originalId).toBe('tx-test-123');
      expect(transaction!.note).toContain('Test Description');
      expect(transaction!.time).toBeDefined();
      expect(new Date(transaction!.time).toISOString().split('T')[0]).toBe('2025-01-15');
      expect(transaction!.accountType).toBe(ACCOUNT_TYPES.lunchflow);
    });

    it('handles transactions with missing description or merchant', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(1);
      setMockedLunchflowAccounts(mockedAccounts);

      const transactionWithoutDetails = {
        id: 'tx-no-details',
        accountId: mockedAccounts[0]!.id,
        amount: -50,
        currency: 'PLN',
        date: new Date().toISOString().split('T')[0]!,
        merchant: '',
        description: '',
      };

      setMockedLunchflowTransactions(mockedAccounts[0]!.id, [transactionWithoutDetails]);

      const syncResult = await helpers.lunchflow.syncAccounts({ raw: true });
      const account = syncResult.accounts[0]!;

      await helpers.lunchflow.syncTransactions({ accountId: account.id, raw: true });

      const allTransactions = await helpers.getTransactions({ raw: true });
      const transaction = allTransactions.find((tx) => tx.originalId === 'tx-no-details');

      expect(transaction).toBeDefined();
      expect(transaction!.note).toBe('Transaction'); // Default fallback
    });
  });

  describe('Error handling', () => {
    it('fails when account does not exist', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const response = await helpers.lunchflow.syncTransactions({ accountId: 99999 });

      expect(response.body.status).toBe('error');
      expect(response.body.response.message).toContain('Lunch Flow account not found');
    });

    it('fails when account is not a Lunchflow account', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      // Create a regular system account
      const systemAccount = await helpers.createAccount({ raw: true });

      const response = await helpers.lunchflow.syncTransactions({ accountId: systemAccount.id });

      expect(response.body.status).toBe('error');
      expect(response.body.response.message).toContain('Lunch Flow account not found');
    });

    it('fails when no API key is stored', async () => {
      // Create a dummy account (won't work without API key anyway)
      const response = await helpers.lunchflow.syncTransactions({ accountId: 1 });

      expect(response.body.status).toBe('error');
    });
  });

  describe('Balance impact', () => {
    it('Lunchflow transactions do not affect account balance calculations', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(1);
      setMockedLunchflowAccounts(mockedAccounts);
      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(5000));

      const syncResult = await helpers.lunchflow.syncAccounts({ raw: true });
      const account = syncResult.accounts[0]!;
      const initialBalance = account.currentBalance;

      // Create transactions
      const mockedTransactions = getMockedLunchflowTransactions(mockedAccounts[0]!.id, 5);
      setMockedLunchflowTransactions(mockedAccounts[0]!.id, mockedTransactions);

      await helpers.lunchflow.syncTransactions({ accountId: account.id, raw: true });

      // Get account again to check balance
      const allAccounts = await helpers.getAccounts();
      const updatedAccount = allAccounts.find((acc) => acc.id === account.id);

      // Balance should remain the same (transactions don't affect it in MVP approach)
      expect(updatedAccount!.currentBalance).toBe(initialBalance);
    });
  });
});
