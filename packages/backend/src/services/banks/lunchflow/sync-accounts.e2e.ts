import { ACCOUNT_TYPES } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import {
  INVALID_LUNCHFLOW_API_KEY,
  getMockedLunchflowAccounts,
  getMockedLunchflowBalance,
} from '@tests/mocks/lunchflow/data';
import {
  resetLunchflowMocks,
  setMockedLunchflowAccounts,
  setMockedLunchflowBalance,
} from '@tests/mocks/lunchflow/mock-api';

describe('Lunchflow Sync Accounts', () => {
  beforeEach(() => {
    resetLunchflowMocks();
  });

  describe('Initial account sync', () => {
    it('successfully syncs Lunchflow accounts', async () => {
      // Setup: Store API key
      await helpers.lunchflow.storeApiKey({ raw: true });

      // Mock 2 accounts with balances
      const mockedAccounts = getMockedLunchflowAccounts(2);
      setMockedLunchflowAccounts(mockedAccounts);
      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(3500.5));
      setMockedLunchflowBalance(mockedAccounts[1]!.id, getMockedLunchflowBalance(1200.75));

      // Sync accounts
      const result = await helpers.lunchflow.syncAccounts({ raw: true });

      expect(result.newCount).toBe(2);
      expect(result.totalCount).toBe(2);
      expect(result.accounts).toHaveLength(2);

      // Verify accounts were created with correct data
      const allAccounts = await helpers.getAccounts();
      const lunchflowAccounts = allAccounts.filter((acc) => acc.type === ACCOUNT_TYPES.lunchflow);

      expect(lunchflowAccounts).toHaveLength(2);

      // Check first account
      const account1 = lunchflowAccounts.find((acc) => acc.externalId === String(mockedAccounts[0]!.id));
      expect(account1).toBeDefined();
      expect(account1!.name).toContain(mockedAccounts[0]!.institution_name);
      expect(account1!.initialBalance).toBe(350050); // 3500.50 * 100
      expect(account1!.currentBalance).toBe(350050);

      // Check second account
      const account2 = lunchflowAccounts.find((acc) => acc.externalId === String(mockedAccounts[1]!.id));
      expect(account2).toBeDefined();
      expect(account2!.initialBalance).toBe(120075); // 1200.75 * 100
    });

    it('handles accounts with zero balance', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(1);
      setMockedLunchflowAccounts(mockedAccounts);
      setMockedLunchflowBalance(mockedAccounts[0]!.id, getMockedLunchflowBalance(0));

      const result = await helpers.lunchflow.syncAccounts({ raw: true });

      expect(result.newCount).toBe(1);

      const allAccounts = await helpers.getAccounts();
      const lunchflowAccount = allAccounts.find(
        (acc) => acc.type === ACCOUNT_TYPES.lunchflow && acc.externalId === String(mockedAccounts[0]!.id),
      );

      expect(lunchflowAccount!.initialBalance).toBe(0);
      expect(lunchflowAccount!.currentBalance).toBe(0);
    });
  });

  describe('Re-syncing accounts', () => {
    it('does not duplicate existing accounts on resync', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(2);
      setMockedLunchflowAccounts(mockedAccounts);

      // First sync
      const result1 = await helpers.lunchflow.syncAccounts({ raw: true });
      expect(result1.newCount).toBe(2);
      expect(result1.totalCount).toBe(2);

      // Second sync with same accounts
      const result2 = await helpers.lunchflow.syncAccounts({ raw: true });
      expect(result2.newCount).toBe(0); // No new accounts
      expect(result2.totalCount).toBe(2); // Still 2 total

      // Verify no duplicates
      const allAccounts = await helpers.getAccounts();
      const lunchflowAccounts = allAccounts.filter((acc) => acc.type === ACCOUNT_TYPES.lunchflow);
      expect(lunchflowAccounts).toHaveLength(2);
    });

    it('syncs only new accounts when additional accounts are added', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      // First sync with 2 accounts
      const initialAccounts = getMockedLunchflowAccounts(2);
      setMockedLunchflowAccounts(initialAccounts);
      const result1 = await helpers.lunchflow.syncAccounts({ raw: true });
      expect(result1.newCount).toBe(2);

      // Add a third account
      const newAccount = {
        id: 3,
        name: 'New Account',
        institution_name: 'New Bank',
        institution_logo: 'https://example.com/logo.png',
        provider: 'gocardless' as const,
        status: 'ACTIVE' as const,
      };
      setMockedLunchflowAccounts([...initialAccounts, newAccount]);
      setMockedLunchflowBalance(newAccount.id, getMockedLunchflowBalance(5000));

      // Second sync
      const result2 = await helpers.lunchflow.syncAccounts({ raw: true });
      expect(result2.newCount).toBe(1); // Only 1 new account
      expect(result2.totalCount).toBe(3); // Total of 3

      const allAccounts = await helpers.getAccounts();
      const lunchflowAccounts = allAccounts.filter((acc) => acc.type === ACCOUNT_TYPES.lunchflow);
      expect(lunchflowAccounts).toHaveLength(3);
    });
  });

  describe('Error handling', () => {
    it('fails when no API key is stored', async () => {
      const response = await helpers.lunchflow.syncAccounts({});

      expect(response.body.status).toBe('error');
      expect(response.body.response.message).toContain('No Lunch Flow API key found');
    });

    it('fails with invalid API key', async () => {
      await helpers.lunchflow.storeApiKey({ apiKey: INVALID_LUNCHFLOW_API_KEY, raw: true });

      const response = await helpers.lunchflow.syncAccounts({});

      expect(response.body.status).toBe('error');
    });
  });

  describe('Currency handling', () => {
    it('correctly handles different currency codes', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(1);
      setMockedLunchflowAccounts(mockedAccounts);
      // Mock balance with specific currency
      setMockedLunchflowBalance(mockedAccounts[0]!.id, {
        amount: 2500.5,
        currency: 'EUR',
      });

      await helpers.lunchflow.syncAccounts({ raw: true });

      const allAccounts = await helpers.getAccounts();
      const lunchflowAccount = allAccounts.find(
        (acc) => acc.type === ACCOUNT_TYPES.lunchflow && acc.externalId === String(mockedAccounts[0]!.id),
      );

      expect(lunchflowAccount!.currencyCode).toBe('EUR');
      expect(lunchflowAccount!.initialBalance).toBe(250050); // 2500.50 * 100
    });
  });

  describe('External data storage', () => {
    it('stores institution data in externalData field', async () => {
      await helpers.lunchflow.storeApiKey({ raw: true });

      const mockedAccounts = getMockedLunchflowAccounts(1);
      setMockedLunchflowAccounts(mockedAccounts);

      await helpers.lunchflow.syncAccounts({ raw: true });

      const allAccounts = await helpers.getAccounts();
      const lunchflowAccount = allAccounts.find(
        (acc) => acc.type === ACCOUNT_TYPES.lunchflow && acc.externalId === String(mockedAccounts[0]!.id),
      );

      expect(lunchflowAccount!.externalData).toBeDefined();
      expect(lunchflowAccount!.externalData).toMatchObject({
        institutionName: mockedAccounts[0]!.institution_name,
        institutionLogo: mockedAccounts[0]!.institution_logo,
        status: 'ACTIVE',
      });
    });
  });
});
