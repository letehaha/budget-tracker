import { beforeEach, describe, expect, it } from '@jest/globals';
import Balances from '@models/Balances.model';
import * as helpers from '@tests/helpers';
import { getMockedLunchflowAccounts, getMockedLunchflowBalance } from '@tests/mocks/lunchflow/data';
import {
  resetLunchflowMocks,
  setMockedLunchflowAccounts,
  setMockedLunchflowBalance,
} from '@tests/mocks/lunchflow/mock-api';

describe('Lunchflow Refresh Balance', () => {
  beforeEach(() => {
    resetLunchflowMocks();
  });

  describe('Balance refresh', () => {
    it('successfully refreshes balance for an account', async () => {
      // Setup
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(1);
      setMockedLunchflowAccounts(mockedAccounts);
      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(5000));

      const syncResult = await helpers.lunchflow.syncAccounts({ raw: true });
      const account = syncResult.accounts[0]!;

      // Change the mocked balance to simulate real balance change
      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(5500.75));

      // Refresh balance
      const result = await helpers.lunchflow.refreshBalance({ accountId: account.id, raw: true });

      expect(result.message).toBe('Balance refreshed successfully');
      expect(result.balance).toBe(5500.75);
      expect(result.currency).toBe('PLN');

      // Verify account balance was updated
      const allAccounts = await helpers.getAccounts();
      const updatedAccount = allAccounts.find((acc) => acc.id === account.id);

      expect(updatedAccount!.currentBalance).toBe(550075); // 5500.75 * 100
    });

    it('creates balance snapshot in Balances table', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(1);
      setMockedLunchflowAccounts(mockedAccounts);
      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(3000));

      const syncResult = await helpers.lunchflow.syncAccounts({ raw: true });
      const account = syncResult.accounts[0]!;

      await helpers.lunchflow.refreshBalance({ accountId: account.id, raw: true });

      // Check Balances table
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const balanceRecord = await Balances.findOne({
        where: {
          accountId: account.id,
          date: today,
        },
      });

      expect(balanceRecord).toBeDefined();
      expect(balanceRecord!.amount).toBeGreaterThan(0);
    });

    it('updates existing balance snapshot for the same day', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(1);
      setMockedLunchflowAccounts(mockedAccounts);
      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(3000));

      const syncResult = await helpers.lunchflow.syncAccounts({ raw: true });
      const account = syncResult.accounts[0]!;

      // First refresh
      await helpers.lunchflow.refreshBalance({ accountId: account.id, raw: true });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const firstBalanceRecord = await Balances.findOne({
        where: {
          accountId: account.id,
          date: today,
        },
      });

      const firstAmount = firstBalanceRecord!.amount;

      // Change balance and refresh again
      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(4000));
      await helpers.lunchflow.refreshBalance({ accountId: account.id, raw: true });

      // Should update the existing record, not create a new one
      const balanceRecords = await Balances.findAll({
        where: {
          accountId: account.id,
          date: today,
        },
      });

      expect(balanceRecords).toHaveLength(1); // Only one record
      expect(balanceRecords[0]!.amount).not.toBe(firstAmount); // Amount should be updated
      expect(balanceRecords[0]!.amount).toBeGreaterThan(firstAmount);
    });

    it('correctly converts currency to base currency in Balances table', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(1);
      setMockedLunchflowAccounts(mockedAccounts);
      // Set balance in PLN
      setMockedLunchflowBalance(mockedAccounts[0]!.id, {
        amount: 1000,
        currency: 'PLN',
      });

      const syncResult = await helpers.lunchflow.syncAccounts({ raw: true });
      const account = syncResult.accounts[0]!;

      await helpers.lunchflow.refreshBalance({ accountId: account.id, raw: true });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const balanceRecord = await Balances.findOne({
        where: {
          accountId: account.id,
          date: today,
        },
      });

      // The amount should be in base currency (converted via calculateRefAmount)
      // Since base currency is set in tests, it should handle conversion
      expect(balanceRecord).toBeDefined();
      expect(balanceRecord!.amount).toBeGreaterThan(0);

      // Verify account has both current and ref balances
      const allAccounts = await helpers.getAccounts();
      const updatedAccount = allAccounts.find((acc) => acc.id === account.id);

      expect(updatedAccount!.currentBalance).toBe(100000); // 1000 * 100 in account currency
      expect(updatedAccount!.refCurrentBalance).toBeGreaterThan(0); // Converted to base currency
    });
  });

  describe('Balance changes', () => {
    it('correctly handles balance increase', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(1);
      setMockedLunchflowAccounts(mockedAccounts);
      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(1000));

      const syncResult = await helpers.lunchflow.syncAccounts({ raw: true });
      const account = syncResult.accounts[0]!;
      const initialBalance = account.currentBalance;

      // Increase balance
      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(1500));
      await helpers.lunchflow.refreshBalance({ accountId: account.id, raw: true });

      const allAccounts = await helpers.getAccounts();
      const updatedAccount = allAccounts.find((acc) => acc.id === account.id);

      expect(updatedAccount!.currentBalance).toBeGreaterThan(initialBalance);
      expect(updatedAccount!.currentBalance).toBe(150000); // 1500 * 100
    });

    it('correctly handles balance decrease', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(1);
      setMockedLunchflowAccounts(mockedAccounts);
      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(1000));

      const syncResult = await helpers.lunchflow.syncAccounts({ raw: true });
      const account = syncResult.accounts[0]!;
      const initialBalance = account.currentBalance;

      // Decrease balance
      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(750.5));
      await helpers.lunchflow.refreshBalance({ accountId: account.id, raw: true });

      const allAccounts = await helpers.getAccounts();
      const updatedAccount = allAccounts.find((acc) => acc.id === account.id);

      expect(updatedAccount!.currentBalance).toBeLessThan(initialBalance);
      expect(updatedAccount!.currentBalance).toBe(75050); // 750.50 * 100
    });

    it('handles balance going to zero', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(1);
      setMockedLunchflowAccounts(mockedAccounts);
      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(500));

      const syncResult = await helpers.lunchflow.syncAccounts({ raw: true });
      const account = syncResult.accounts[0]!;

      // Set balance to zero
      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(0));
      await helpers.lunchflow.refreshBalance({ accountId: account.id, raw: true });

      const allAccounts = await helpers.getAccounts();
      const updatedAccount = allAccounts.find((acc) => acc.id === account.id);

      expect(updatedAccount!.currentBalance).toBe(0);
    });

    it('handles negative balance (overdraft)', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(1);
      setMockedLunchflowAccounts(mockedAccounts);
      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(100));

      const syncResult = await helpers.lunchflow.syncAccounts({ raw: true });
      const account = syncResult.accounts[0]!;

      // Set negative balance
      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(-250.75));
      await helpers.lunchflow.refreshBalance({ accountId: account.id, raw: true });

      const allAccounts = await helpers.getAccounts();
      const updatedAccount = allAccounts.find((acc) => acc.id === account.id);

      expect(updatedAccount!.currentBalance).toBe(-25075); // -250.75 * 100
    });
  });

  describe('Error handling', () => {
    it('fails when account does not exist', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const response = await helpers.lunchflow.refreshBalance({ accountId: 99999 });

      expect(response.body.status).toBe('error');
      expect(response.body.response.message).toContain('Lunch Flow account not found');
    });

    it('fails when account is not a Lunchflow account', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      // Create a regular system account
      const systemAccount = await helpers.createAccount({ raw: true });

      const response = await helpers.lunchflow.refreshBalance({ accountId: systemAccount.id });

      expect(response.body.status).toBe('error');
      expect(response.body.response.message).toContain('Lunch Flow account not found');
    });

    it('fails when no API key is stored', async () => {
      const response = await helpers.lunchflow.refreshBalance({ accountId: 1 });

      expect(response.body.status).toBe('error');
    });
  });

  describe('Multiple accounts', () => {
    it('refreshes balances independently for multiple accounts', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(2);
      setMockedLunchflowAccounts(mockedAccounts);
      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(1000));
      setMockedLunchflowBalance(mockedAccounts[1]!.id, getMockedLunchflowBalance(2000));

      const syncResult = await helpers.lunchflow.syncAccounts({ raw: true });
      const account1 = syncResult.accounts[0]!;
      const account2 = syncResult.accounts[1]!;

      // Change balances differently
      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(1500));
      setMockedLunchflowBalance(mockedAccounts[1]!.id, getMockedLunchflowBalance(2500));

      // Refresh both
      await helpers.lunchflow.refreshBalance({ accountId: account1.id, raw: true });
      await helpers.lunchflow.refreshBalance({ accountId: account2.id, raw: true });

      // Verify both were updated independently
      const allAccounts = await helpers.getAccounts();
      const updatedAccount1 = allAccounts.find((acc) => acc.id === account1.id);
      const updatedAccount2 = allAccounts.find((acc) => acc.id === account2.id);

      expect(updatedAccount1!.currentBalance).toBe(150000); // 1500 * 100
      expect(updatedAccount2!.currentBalance).toBe(250000); // 2500 * 100
    });
  });

  describe('InitialBalance preservation', () => {
    it('does not modify initialBalance when refreshing balance', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(1);
      setMockedLunchflowAccounts(mockedAccounts);
      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(1000));

      const syncResult = await helpers.lunchflow.syncAccounts({ raw: true });
      const account = syncResult.accounts[0]!;
      const initialBalance = account.initialBalance;

      // Change balance multiple times
      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(1500));
      await helpers.lunchflow.refreshBalance({ accountId: account.id, raw: true });

      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(2000));
      await helpers.lunchflow.refreshBalance({ accountId: account.id, raw: true });

      // Verify initialBalance stayed the same
      const allAccounts = await helpers.getAccounts();
      const updatedAccount = allAccounts.find((acc) => acc.id === account.id);

      expect(updatedAccount!.initialBalance).toBe(initialBalance);
      expect(updatedAccount!.currentBalance).toBe(200000); // Changed
    });
  });
});
