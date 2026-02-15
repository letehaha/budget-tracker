import {
  ACCOUNT_TYPES,
  BANK_PROVIDER_TYPE,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import Transactions from '@models/Transactions.model';
import * as helpers from '@tests/helpers';
import { buildTransactionPayload } from '@tests/helpers/transactions';
import {
  getMockedLunchFlowAccounts,
  getMockedLunchFlowTransactions,
  getMockedLunchFlowTransactionsWithPending,
} from '@tests/mocks/lunchflow/data';
import {
  INVALID_LUNCHFLOW_API_KEY,
  VALID_LUNCHFLOW_API_KEY,
  VALID_LUNCHFLOW_API_KEY_2,
  getLunchFlowAccountsMock,
  getLunchFlowBalanceMock,
  getLunchFlowTransactionsMock,
} from '@tests/mocks/lunchflow/mock-api';
import { addDays, subDays } from 'date-fns';
import { Op } from 'sequelize';

/**
 * E2E tests for LunchFlow Data Provider
 * Tests the complete flow from connection to account sync and transaction sync
 */
describe('LunchFlow Data Provider E2E', () => {
  describe('Complete connection flow', () => {
    it('should complete the full flow: list providers -> connect -> list connections -> list external accounts -> connect accounts -> get details', async () => {
      // Step 1: Fetch supported providers
      const { providers } = await helpers.bankDataProviders.getSupportedBankProviders({ raw: true });

      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);

      // Verify LunchFlow is in the list
      const lunchflowProvider = providers.find((p: { type: string }) => p.type === BANK_PROVIDER_TYPE.LUNCHFLOW)!;
      expect(lunchflowProvider).toBeDefined();
      expect(lunchflowProvider.name).toBe('Lunch Flow');
      expect(lunchflowProvider.credentialFields).toBeDefined();
      expect(Array.isArray(lunchflowProvider.credentialFields)).toBe(true);

      // Step 2: Connect to LunchFlow
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      expect(connectResult).toHaveProperty('connectionId');
      expect(connectResult.connectionId).toBeGreaterThan(0);

      const connectionId = connectResult.connectionId;

      // Step 3: Fetch user's connections
      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });

      expect(Array.isArray(connections)).toBe(true);
      expect(connections.length).toBeGreaterThan(0);

      const connection = connections.find((c: { id: number }) => c.id === connectionId);
      expect(connection).toBeDefined();
      expect(connection?.providerType).toBe(BANK_PROVIDER_TYPE.LUNCHFLOW);
      expect(connection?.providerName).toBe('LunchFlow');
      expect(connection?.isActive).toBe(true);
      expect(connection?.accountsCount).toBe(0);

      // Step 4: List external accounts
      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId,
        raw: true,
      });

      expect(Array.isArray(externalAccounts)).toBe(true);
      expect(externalAccounts.length).toBeGreaterThan(0);

      const firstAccount = externalAccounts[0];
      expect(firstAccount).toHaveProperty('externalId');
      expect(firstAccount).toHaveProperty('name');
      expect(firstAccount).toHaveProperty('type');
      expect(firstAccount).toHaveProperty('balance');
      expect(firstAccount).toHaveProperty('currency');

      // Step 5: Connect selected accounts (set up mocks first since sync is direct)
      const accountIdsToConnect = externalAccounts.map((acc: { externalId: string }) => acc.externalId);

      global.mswMockServer.use(getLunchFlowTransactionsMock(), getLunchFlowBalanceMock());

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId,
        accountExternalIds: accountIdsToConnect,
        raw: true,
      });

      expect(Array.isArray(syncedAccounts)).toBe(true);
      expect(syncedAccounts.length).toBe(accountIdsToConnect.length);

      syncedAccounts.forEach((account, idx: number) => {
        expect(account.externalId).toBe(accountIdsToConnect[idx]);
      });

      // Step 6: Fetch connection details
      const { connection: connectionDetails } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId,
        raw: true,
      });

      expect(connectionDetails).toBeDefined();
      expect(connectionDetails.id).toBe(connectionId);
      expect(connectionDetails.providerType).toBe(BANK_PROVIDER_TYPE.LUNCHFLOW);
      expect(connectionDetails.providerName).toBe('LunchFlow');
      expect(connectionDetails.isActive).toBe(true);

      expect(connectionDetails.provider).toBeDefined();
      expect(connectionDetails.provider.name).toBe('Lunch Flow');
      expect(connectionDetails.provider.description).toBeDefined();
      expect(connectionDetails.provider.features).toBeDefined();

      expect(Array.isArray(connectionDetails.accounts)).toBe(true);
      expect(connectionDetails.accounts.length).toBe(accountIdsToConnect.length);

      connectionDetails.accounts.forEach(
        (account: { externalId: string; id: number; name: string; currentBalance: number; currencyCode: string }) => {
          expect(accountIdsToConnect).toContain(account.externalId);
          expect(account).toHaveProperty('id');
          expect(account).toHaveProperty('name');
          expect(account).toHaveProperty('currentBalance');
          expect(account).toHaveProperty('currencyCode');
        },
      );

      // Verify connections list now shows updated account count
      const { connections: updatedConnections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const updatedConnection = updatedConnections.find((c: { id: number }) => c.id === connectionId);
      expect(updatedConnection?.accountsCount).toBe(accountIdsToConnect.length);
    });
  });

  describe('Step 1: List supported providers', () => {
    it('should include LunchFlow provider', async () => {
      const { providers } = await helpers.bankDataProviders.getSupportedBankProviders({ raw: true });

      const lunchflowProvider = providers.find((p: { type: string }) => p.type === BANK_PROVIDER_TYPE.LUNCHFLOW)!;
      expect(lunchflowProvider).toBeDefined();
      expect(lunchflowProvider.name).toBe('Lunch Flow');
    });

    it('should include credential fields for LunchFlow', async () => {
      const { providers } = await helpers.bankDataProviders.getSupportedBankProviders({ raw: true });

      const lunchflowProvider = providers.find((p: { type: string }) => p.type === BANK_PROVIDER_TYPE.LUNCHFLOW)!;
      expect(lunchflowProvider.credentialFields.length).toBeGreaterThan(0);

      const apiKeyField = lunchflowProvider.credentialFields.find((f: { name: string }) => f.name === 'apiKey');
      expect(apiKeyField).toBeDefined();
      expect(apiKeyField!.required).toBe(true);
    });
  });

  describe('Step 2: Connect provider', () => {
    it('should successfully connect with valid API key', async () => {
      const result = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      expect(result).toHaveProperty('connectionId');
      expect(result.connectionId).toBeGreaterThan(0);
    });

    it('should fail with invalid API key', async () => {
      const result = await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/${BANK_PROVIDER_TYPE.LUNCHFLOW}/connect`,
        payload: {
          credentials: { apiKey: INVALID_LUNCHFLOW_API_KEY },
        },
      });

      expect(result.status).toEqual(ERROR_CODES.Forbidden);
    });

    it('should fail with missing apiKey field', async () => {
      const result = await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/${BANK_PROVIDER_TYPE.LUNCHFLOW}/connect`,
        payload: {
          credentials: { wrongField: 'value' },
        },
      });

      expect(result.status).toEqual(ERROR_CODES.ValidationError);
    });

    it('should auto-name connection "LunchFlow"', async () => {
      const result = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const connection = connections.find((c: { id: number }) => c.id === result.connectionId);
      expect(connection?.providerName).toBe('LunchFlow');
    });

    it('should not create connection on auth failure', async () => {
      const { connections: connectionsBefore } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const countBefore = connectionsBefore.length;

      await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/${BANK_PROVIDER_TYPE.LUNCHFLOW}/connect`,
        payload: {
          credentials: { apiKey: INVALID_LUNCHFLOW_API_KEY },
        },
      });

      const { connections: connectionsAfter } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      expect(connectionsAfter.length).toBe(countBefore);
    });
  });

  describe('Step 3: List user connections', () => {
    it('should list LunchFlow connection after connecting', async () => {
      const result = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const connection = connections.find((c: { id: number }) => c.id === result.connectionId);

      expect(connection).toBeDefined();
      expect(connection?.providerType).toBe(BANK_PROVIDER_TYPE.LUNCHFLOW);
      expect(connection?.isActive).toBe(true);
      expect(connection?.lastSyncAt).toBeNull();
      expect(connection?.accountsCount).toBe(0);
    });

    it('should allow multiple LunchFlow connections', async () => {
      const result1 = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const result2 = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      expect(result1.connectionId).not.toBe(result2.connectionId);

      // Second connection should have counter in name
      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const lunchflowConnections = connections.filter(
        (c: { providerType: string }) => c.providerType === BANK_PROVIDER_TYPE.LUNCHFLOW,
      );

      expect(lunchflowConnections.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Step 4: List external accounts', () => {
    it('should return 404 for non-existent connection', async () => {
      const result = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: 99999,
      });

      expect(result.status).toEqual(ERROR_CODES.NotFoundError);
    });

    it('should list external accounts from LunchFlow', async () => {
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const { accounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      expect(Array.isArray(accounts)).toBe(true);
      expect(accounts.length).toBeGreaterThan(0);
    });

    it('should return accounts with correct structure', async () => {
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const { accounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      const account = accounts[0]!;
      expect(account).toHaveProperty('externalId');
      expect(account).toHaveProperty('name');
      expect(account).toHaveProperty('type');
      expect(account).toHaveProperty('balance');
      expect(account).toHaveProperty('currency');
      expect(typeof account.balance).toBe('number');
      expect(typeof account.currency).toBe('string');
    });

    it('should return accounts matching mocked data count', async () => {
      const mockedData = getMockedLunchFlowAccounts();
      const activeAccounts = mockedData.accounts.filter((a) => a.status === 'ACTIVE');

      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const { accounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      expect(accounts.length).toBe(activeAccounts.length);
    });

    it('should skip accounts with no currency from either account or balance response', async () => {
      // Add a third account with no currency on the account object
      const mockedData = getMockedLunchFlowAccounts();
      mockedData.accounts.push({
        id: 1003,
        name: 'No Currency Account',
        institution_name: 'Unknown Bank',
        institution_logo: null,
        provider: 'test_provider',
        status: 'ACTIVE',
      });
      mockedData.total = mockedData.accounts.length;

      // Override accounts to include the no-currency account
      global.mswMockServer.use(
        getLunchFlowAccountsMock({ response: mockedData }),
        // Override balance for account 1003 to return no currency
        getLunchFlowBalanceMock({
          accountId: 1003,
          response: { balance: { amount: 100, currency: '' } },
        }),
      );

      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const { accounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      // Account 1003 should be skipped — only 2 original accounts returned
      expect(accounts.length).toBe(2);
      expect(accounts.find((a: { externalId: string }) => a.externalId === '1003')).toBeUndefined();
    });
  });

  describe('Step 5: Connect selected accounts', () => {
    it('should return 404 for non-existent connection', async () => {
      const result = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: 99999,
        accountExternalIds: ['1001'],
      });

      expect(result.status).toEqual(ERROR_CODES.NotFoundError);
    });

    it('should fail with invalid account IDs', async () => {
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const result = await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/connections/${connectionResult.connectionId}/sync-selected-accounts`,
        payload: {
          accountExternalIds: ['non-existent-id'],
        },
      });

      expect(result.status).toEqual(ERROR_CODES.BadRequest);
    });

    it('should successfully connect valid accounts', async () => {
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      const accountIds = externalAccounts.map((acc: { externalId: string }) => acc.externalId);

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: accountIds,
        raw: true,
      });

      expect(syncedAccounts.length).toBe(accountIds.length);
      syncedAccounts.forEach((account) => {
        expect(accountIds).toContain(account.externalId);
      });
    });

    it('should use "{institutionName} {currency}" as account name when provider returns empty name', async () => {
      const mockedData = getMockedLunchFlowAccounts();
      // Set first account name to empty string
      mockedData.accounts = [{ ...mockedData.accounts[0]!, name: '' }];
      mockedData.total = 1;

      global.mswMockServer.use(getLunchFlowAccountsMock({ response: mockedData }));

      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: ['1001'],
        raw: true,
      });

      // Should fallback to "{institutionName} {currency}" from metadata and balance response
      expect(syncedAccounts[0]!.name).toBe('Test Bank USA USD');
    });

    it('should update accountsCount after connecting accounts', async () => {
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: [externalAccounts[0]!.externalId],
        raw: true,
      });

      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const connection = connections.find((c: { id: number }) => c.id === connectionResult.connectionId);
      expect(connection?.accountsCount).toBe(1);
    });

    it('should update connection lastSyncAt after connecting accounts', async () => {
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      // Set up transaction mock for auto-sync
      global.mswMockServer.use(getLunchFlowTransactionsMock(), getLunchFlowBalanceMock());

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: [externalAccounts[0]!.externalId],
        raw: true,
      });

      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const connection = connections.find((c: { id: number }) => c.id === connectionResult.connectionId);
      expect(connection?.lastSyncAt).not.toBeNull();
    });
  });

  describe('Step 6: Get connection details', () => {
    it('should return 404 for non-existent connection', async () => {
      const result = await helpers.makeRequest({
        method: 'get',
        url: '/bank-data-providers/connections/99999',
      });

      expect(result.status).toEqual(ERROR_CODES.NotFoundError);
    });

    it('should return connection details with provider metadata', async () => {
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const { connection: details } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      expect(details.id).toBe(connectionResult.connectionId);
      expect(details.providerType).toBe(BANK_PROVIDER_TYPE.LUNCHFLOW);
      expect(details.isActive).toBe(true);

      expect(details.provider).toBeDefined();
      expect(details.provider.name).toBe('Lunch Flow');
      expect(details.provider.description).toBeDefined();
      expect(details.provider.features).toBeDefined();
      expect(details.provider.features.supportsManualSync).toBe(true);
      expect(details.provider.features.supportsAutoSync).toBe(true);
      expect(details.provider.features.supportsWebhooks).toBe(false);
    });

    it('should include connected accounts in details', async () => {
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: [externalAccounts[0]!.externalId, externalAccounts[1]!.externalId],
        raw: true,
      });

      const { connection: details } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      expect(details.accounts).toBeDefined();
      expect(details.accounts.length).toBe(2);

      details.accounts.forEach(
        (account: { id: number; name: string; externalId: string; currentBalance: number; currencyCode: string }) => {
          expect(account).toHaveProperty('id');
          expect(account).toHaveProperty('name');
          expect(account).toHaveProperty('externalId');
          expect(account).toHaveProperty('currentBalance');
          expect(account).toHaveProperty('currencyCode');
        },
      );
    });

    it('should return empty accounts array when no accounts connected', async () => {
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const { connection: details } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      expect(details.accounts).toEqual([]);
    });
  });

  describe('Transaction sync', () => {
    it('should automatically sync transactions when connecting accounts', async () => {
      const MOCK_AMOUNT = 5;

      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      // Use only first account to simplify
      const accountIds = [externalAccounts[0]!.externalId];

      // Set up transaction mocks before connecting
      global.mswMockServer.use(
        getLunchFlowTransactionsMock({
          response: helpers.lunchflow.mockedTransactionData(MOCK_AMOUNT),
          accountId: externalAccounts[0]!.externalId,
        }),
        getLunchFlowBalanceMock({ accountId: externalAccounts[0]!.externalId }),
      );

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: accountIds,
        raw: true,
      });

      // LunchFlow uses direct sync (no queue), so transactions should be available immediately
      const transactions = await Transactions.findAll({
        where: {
          accountId: {
            [Op.in]: syncedAccounts.map((i) => i.id),
          },
        },
        raw: true,
      });

      expect(Array.isArray(transactions)).toBe(true);
      expect(transactions.length).toBe(MOCK_AMOUNT);
    });

    it('should skip pending transactions (null ID)', async () => {
      const MOCK_AMOUNT = 5;
      const EXPECTED_NON_PENDING = MOCK_AMOUNT - 1; // One is made pending

      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      const accountIds = [externalAccounts[0]!.externalId];

      // Use mock data with pending transactions
      global.mswMockServer.use(
        getLunchFlowTransactionsMock({
          response: getMockedLunchFlowTransactionsWithPending(MOCK_AMOUNT),
          accountId: externalAccounts[0]!.externalId,
        }),
        getLunchFlowBalanceMock({ accountId: externalAccounts[0]!.externalId }),
      );

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: accountIds,
        raw: true,
      });

      const transactions = await Transactions.findAll({
        where: {
          accountId: {
            [Op.in]: syncedAccounts.map((i) => i.id),
          },
        },
        raw: true,
      });

      expect(transactions.length).toBe(EXPECTED_NON_PENDING);
    });

    it('should not duplicate transactions on re-sync', async () => {
      const MOCK_AMOUNT = 3;

      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      const accountIds = [externalAccounts[0]!.externalId];

      // Generate fixed mock data to reuse
      const mockedTxData = helpers.lunchflow.mockedTransactionData(MOCK_AMOUNT);

      global.mswMockServer.use(
        getLunchFlowTransactionsMock({ response: mockedTxData, accountId: accountIds[0] }),
        getLunchFlowBalanceMock({ accountId: accountIds[0] }),
      );

      // First sync: connect accounts
      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: accountIds,
        raw: true,
      });

      // Reset mock for second sync with same data
      global.mswMockServer.use(
        getLunchFlowTransactionsMock({ response: mockedTxData, accountId: accountIds[0] }),
        getLunchFlowBalanceMock({ accountId: accountIds[0] }),
      );

      // Second sync: trigger manual sync
      await helpers.bankDataProviders.syncTransactionsForAccount({
        connectionId: connectionResult.connectionId,
        accountId: syncedAccounts[0]!.id,
        raw: true,
      });

      // Count transactions - should still be MOCK_AMOUNT, not doubled
      const transactions = await Transactions.findAll({
        where: {
          accountId: syncedAccounts[0]!.id,
        },

        raw: true,
      });

      expect(transactions.length).toBe(MOCK_AMOUNT);
    });
  });

  describe('Disconnect and reconnect flow', () => {
    it('should disconnect a LunchFlow connection', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      await helpers.bankDataProviders.disconnectProvider({
        connectionId: connectResult.connectionId,
        raw: true,
      });

      // Connection should no longer exist
      const result = await helpers.makeRequest({
        method: 'get',
        url: `/bank-data-providers/connections/${connectResult.connectionId}`,
      });

      expect(result.status).toEqual(ERROR_CODES.NotFoundError);
    });

    it('should keep accounts and reset them to system type when disconnecting without removeAssociatedAccounts', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectResult.connectionId,
        raw: true,
      });

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectResult.connectionId,
        accountExternalIds: [externalAccounts[0]!.externalId],
        raw: true,
      });

      const accountId = syncedAccounts[0]!.id;

      // Disconnect WITHOUT removing accounts
      await helpers.bankDataProviders.disconnectProvider({
        connectionId: connectResult.connectionId,
        removeAssociatedAccounts: false,
        raw: true,
      });

      // Account should still exist but be converted to system type
      const account = await helpers.getAccount({ id: accountId, raw: true });
      expect(account).toBeDefined();
      expect(account.id).toBe(accountId);
      expect(account.type).toBe(ACCOUNT_TYPES.system);
      expect(account.bankDataProviderConnectionId).toBeNull();
      expect(account.externalId).toBeNull();
      expect(account.externalData).toHaveProperty('connectionHistory');
    });

    it('should remove accounts when disconnecting with removeAssociatedAccounts', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectResult.connectionId,
        raw: true,
      });

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectResult.connectionId,
        accountExternalIds: [externalAccounts[0]!.externalId],
        raw: true,
      });

      const accountId = syncedAccounts[0]!.id;

      // Disconnect WITH removing accounts
      await helpers.bankDataProviders.disconnectProvider({
        connectionId: connectResult.connectionId,
        removeAssociatedAccounts: true,
        raw: true,
      });

      // Account should be gone
      const accounts = await helpers.getAccounts();
      const deletedAccount = accounts.find((acc) => acc.id === accountId);
      expect(deletedAccount).toBeUndefined();
    });

    it('should allow reconnecting after disconnect', async () => {
      // Connect
      const firstConnect = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      // Disconnect
      await helpers.bankDataProviders.disconnectProvider({
        connectionId: firstConnect.connectionId,
        raw: true,
      });

      // Reconnect with fresh connection
      const secondConnect = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      expect(secondConnect.connectionId).not.toBe(firstConnect.connectionId);

      // New connection should work
      const { accounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: secondConnect.connectionId,
        raw: true,
      });

      expect(accounts.length).toBeGreaterThan(0);
    });

    it('should sync transactions after reconnecting', async () => {
      const MOCK_AMOUNT = 3;

      // Connect and sync
      const firstConnect = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const { accounts: externalAccounts1 } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: firstConnect.connectionId,
        raw: true,
      });

      global.mswMockServer.use(
        getLunchFlowTransactionsMock({
          response: helpers.lunchflow.mockedTransactionData(MOCK_AMOUNT),
          accountId: externalAccounts1[0]!.externalId,
        }),
        getLunchFlowBalanceMock({ accountId: externalAccounts1[0]!.externalId }),
      );

      await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: firstConnect.connectionId,
        accountExternalIds: [externalAccounts1[0]!.externalId],
        raw: true,
      });

      // Disconnect (keep accounts)
      await helpers.bankDataProviders.disconnectProvider({
        connectionId: firstConnect.connectionId,
        removeAssociatedAccounts: false,
        raw: true,
      });

      // Reconnect
      const secondConnect = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const { accounts: externalAccounts2 } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: secondConnect.connectionId,
        raw: true,
      });

      // Set up mocks for second connection sync
      global.mswMockServer.use(
        getLunchFlowTransactionsMock({
          response: helpers.lunchflow.mockedTransactionData(MOCK_AMOUNT),
          accountId: externalAccounts2[0]!.externalId,
        }),
        getLunchFlowBalanceMock({ accountId: externalAccounts2[0]!.externalId }),
      );

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: secondConnect.connectionId,
        accountExternalIds: [externalAccounts2[0]!.externalId],
        raw: true,
      });

      // New account should have synced transactions
      const transactions = await Transactions.findAll({
        where: { accountId: syncedAccounts[0]!.id },
        raw: true,
      });

      expect(transactions.length).toBe(MOCK_AMOUNT);
    });

    it('should reset accounts to system type on disconnect and allow relinking without duplicates', async () => {
      const MOCK_AMOUNT = 5;
      const mockedTransactions = getMockedLunchFlowTransactions(MOCK_AMOUNT);
      const externalAccountId = getMockedLunchFlowAccounts().accounts[0]!.id.toString();

      // 1. Connect provider, import accounts, sync transactions
      const firstConnect = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      global.mswMockServer.use(
        getLunchFlowTransactionsMock({ response: mockedTransactions, accountId: externalAccountId }),
        getLunchFlowBalanceMock({ accountId: externalAccountId }),
      );

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: firstConnect.connectionId,
        accountExternalIds: [externalAccountId],
        raw: true,
      });

      const accountId = syncedAccounts[0]!.id;

      // Verify initial sync created transactions
      const initialTxs = await Transactions.findAll({
        where: { accountId },
        raw: true,
      });
      expect(initialTxs.length).toBe(MOCK_AMOUNT);

      // 2. Disconnect the integration (keep accounts)
      await helpers.bankDataProviders.disconnectProvider({
        connectionId: firstConnect.connectionId,
        removeAssociatedAccounts: false,
        raw: true,
      });

      // 3. Verify account was reset to system type
      const disconnectedAccount = await helpers.getAccount({ id: accountId, raw: true });
      expect(disconnectedAccount.type).toBe(ACCOUNT_TYPES.system);
      expect(disconnectedAccount.bankDataProviderConnectionId).toBeNull();
      expect(disconnectedAccount.externalId).toBeNull();
      expect(disconnectedAccount.externalData).toHaveProperty('connectionHistory');

      // Verify transactions were reset to system type too
      const resetTxs = await Transactions.findAll({
        where: { accountId },
        raw: true,
      });
      expect(resetTxs.every((tx) => tx.accountType === ACCOUNT_TYPES.system)).toBe(true);
      expect(resetTxs.every((tx) => tx.originalId === null)).toBe(true);

      // 4. Reconnect the integration
      const secondConnect = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      // 5. Relink the existing account to the new connection
      global.mswMockServer.use(
        getLunchFlowTransactionsMock({ response: mockedTransactions, accountId: externalAccountId }),
        getLunchFlowBalanceMock({ accountId: externalAccountId }),
      );

      await helpers.linkAccountToBankConnection({
        id: accountId,
        connectionId: secondConnect.connectionId,
        externalAccountId,
        raw: true,
      });

      // 6. Sync transactions on the relinked account
      await helpers.bankDataProviders.syncTransactionsForAccount({
        connectionId: secondConnect.connectionId,
        accountId,
        raw: true,
      });

      // 7. Verify: same transactions, no duplicates
      const finalTxs = await Transactions.findAll({
        where: { accountId },
        raw: true,
      });
      expect(finalTxs.length).toBe(MOCK_AMOUNT);

      // Verify originalIds were restored via secondary dedup
      const restoredOriginalIds = finalTxs.filter((tx) => tx.originalId !== null);
      expect(restoredOriginalIds.length).toBeGreaterThanOrEqual(1);

      // Verify account is back to lunchflow type
      const relinkedAccount = await helpers.getAccount({ id: accountId, raw: true });
      expect(relinkedAccount.type).toBe(ACCOUNT_TYPES.lunchflow);
      expect(relinkedAccount.bankDataProviderConnectionId).toBe(secondConnect.connectionId);
      expect(relinkedAccount.externalId).toBe(externalAccountId);
    });
  });

  describe('Unlink and relink account flow', () => {
    it('should not duplicate transactions when unlinking and relinking an account', async () => {
      const MOCK_AMOUNT = 5;
      const mockedTransactions = getMockedLunchFlowTransactions(MOCK_AMOUNT);

      // 1. Connect provider and link accounts with initial sync
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      global.mswMockServer.use(
        getLunchFlowTransactionsMock({ response: mockedTransactions }),
        getLunchFlowBalanceMock(),
      );

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: [externalAccounts[0]!.externalId],
        raw: true,
      });

      const accountId = syncedAccounts[0]!.id;
      const externalId = syncedAccounts[0]!.externalId;

      // Verify initial transactions were created
      const initialTx = await Transactions.findAll({
        where: { accountId },
        raw: true,
      });
      expect(initialTx.length).toBe(MOCK_AMOUNT);

      // 2. Unlink the account from bank connection
      await helpers.unlinkAccountFromBankConnection({ id: accountId, raw: true });

      // Verify originalId was cleared but transactions still exist
      const unlinkedTx = await Transactions.findAll({
        where: { accountId },
        raw: true,
      });
      expect(unlinkedTx.length).toBe(MOCK_AMOUNT);
      expect(unlinkedTx.every((tx) => tx.originalId === null)).toBe(true);

      // Verify originalSource was preserved in externalData
      const txWithOriginalSource = unlinkedTx.filter(
        (tx) => (tx.externalData as Record<string, unknown>)?.originalSource,
      );
      expect(txWithOriginalSource.length).toBe(MOCK_AMOUNT);

      // 3. Relink the same account back — use the same mocked transactions
      global.mswMockServer.use(
        getLunchFlowTransactionsMock({ response: mockedTransactions }),
        getLunchFlowBalanceMock(),
      );

      await helpers.linkAccountToBankConnection({
        id: accountId,
        connectionId: connectionResult.connectionId,
        externalAccountId: externalId,
        raw: true,
      });

      // 4. Verify no duplicates — should still have the same number of transactions
      const afterRelinkTx = await Transactions.findAll({
        where: { accountId },
        raw: true,
      });

      // The relink may create a balance adjustment transaction, so filter those out
      const syncedTx = afterRelinkTx.filter(
        (tx) => (tx.externalData as Record<string, unknown>)?.type !== 'bank_connection_balance_adjustment',
      );

      // Must be exactly MOCK_AMOUNT — no duplicates
      expect(syncedTx.length).toBe(MOCK_AMOUNT);

      // Date filtering means only transactions on or after the latest existing date
      // are re-processed. The most recent tx (index 0, dated "today") gets its
      // originalId restored via secondary dedup. Older ones are skipped.
      const restoredOriginalIds = syncedTx.filter((tx) => tx.originalId !== null);
      expect(restoredOriginalIds.length).toBeGreaterThanOrEqual(1);
    });

    it('should sync only new transactions after unlinking, adding a manual transaction, and relinking', async () => {
      const MOCK_AMOUNT = 5;
      const now = new Date();

      // Create bank transactions with dates in the past (today-5 to today-1)
      const mockedTransactions = getMockedLunchFlowTransactions(MOCK_AMOUNT);
      // Force known dates: today-5, today-4, ..., today-1
      mockedTransactions.transactions.forEach((tx, i) => {
        tx.date = subDays(now, MOCK_AMOUNT - i).toISOString();
      });

      // 1. Connect provider and link accounts with initial sync
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      global.mswMockServer.use(
        getLunchFlowTransactionsMock({ response: mockedTransactions }),
        getLunchFlowBalanceMock(),
      );

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: [externalAccounts[0]!.externalId],
        raw: true,
      });

      const accountId = syncedAccounts[0]!.id;
      const externalId = syncedAccounts[0]!.externalId;

      // Verify initial sync
      const initialTx = await Transactions.findAll({
        where: { accountId },
        raw: true,
      });
      expect(initialTx.length).toBe(MOCK_AMOUNT);

      // 2. Unlink the account
      await helpers.unlinkAccountFromBankConnection({ id: accountId, raw: true });

      // 3. Add a manual transaction dated in the future (today + 5 days)
      const manualTxDate = addDays(now, 5);
      await helpers.createTransaction({
        raw: true,
        payload: buildTransactionPayload({
          accountId,
          amount: 42,
          time: manualTxDate.toISOString(),
          transactionType: TRANSACTION_TYPES.expense,
          paymentType: PAYMENT_TYPES.creditCard,
          transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
        }),
      });

      // Verify manual tx was created
      const txAfterManual = await Transactions.findAll({
        where: { accountId },
        raw: true,
      });
      expect(txAfterManual.length).toBe(MOCK_AMOUNT + 1);

      // 4. Relink — API returns the same 5 old transactions PLUS 2 new ones
      // dated after the manual transaction
      const newTx1Date = addDays(now, 5); // same day as manual tx — should be processed
      const newTx2Date = addDays(now, 6);
      const relinkTransactions = {
        ...mockedTransactions,
        transactions: [
          ...mockedTransactions.transactions,
          {
            id: 'new-tx-after-manual-1',
            accountId: 1001,
            amount: -25.0,
            currency: 'USD',
            date: newTx1Date.toISOString(),
            merchant: 'New Merchant 1',
            description: 'New transaction 1',
            isPending: false,
          },
          {
            id: 'new-tx-after-manual-2',
            accountId: 1001,
            amount: -15.0,
            currency: 'USD',
            date: newTx2Date.toISOString(),
            merchant: 'New Merchant 2',
            description: 'New transaction 2',
            isPending: false,
          },
        ],
        total: mockedTransactions.transactions.length + 2,
      };

      global.mswMockServer.use(
        getLunchFlowTransactionsMock({ response: relinkTransactions }),
        getLunchFlowBalanceMock(),
      );

      await helpers.linkAccountToBankConnection({
        id: accountId,
        connectionId: connectionResult.connectionId,
        externalAccountId: externalId,
        raw: true,
      });

      // 5. Verify: old bank transactions were NOT re-processed (filtered by date),
      //    only the 2 new ones were created
      const finalTx = await Transactions.findAll({
        where: { accountId },
        raw: true,
      });

      // Filter out any balance adjustment transactions
      const nonAdjustmentTx = finalTx.filter(
        (tx) => (tx.externalData as Record<string, unknown>)?.type !== 'bank_connection_balance_adjustment',
      );

      // 5 original bank txs + 1 manual tx + 2 new bank txs = 8
      expect(nonAdjustmentTx.length).toBe(MOCK_AMOUNT + 1 + 2);

      // Verify the 2 new transactions were created with correct originalIds
      const newSyncedTx = nonAdjustmentTx.filter(
        (tx) => tx.originalId === 'new-tx-after-manual-1' || tx.originalId === 'new-tx-after-manual-2',
      );
      expect(newSyncedTx.length).toBe(2);

      // Verify the original 5 bank transactions still have originalId = null
      // (they were NOT re-processed because their dates are before the latest tx).
      // The 5 unlinked bank txs have originalId = null WITH originalSource.
      const unlinkedBankTx = nonAdjustmentTx.filter(
        (tx) => tx.originalId === null && (tx.externalData as Record<string, unknown>)?.originalSource,
      );
      expect(unlinkedBankTx.length).toBe(MOCK_AMOUNT);
    });
  });

  describe('Update connection details', () => {
    it('should return 404 for non-existent connection', async () => {
      const result = await helpers.bankDataProviders.updateConnectionDetails({
        connectionId: 99999,
        providerName: 'New Name',
      });

      expect(result.status).toEqual(ERROR_CODES.NotFoundError);
    });

    it('should fail when neither providerName nor credentials is provided', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const result = await helpers.makeRequest({
        method: 'patch',
        url: `/bank-data-providers/connections/${connectResult.connectionId}`,
        payload: {},
      });

      expect(result.status).toEqual(ERROR_CODES.ValidationError);
    });

    it('should update provider name', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const { connection } = await helpers.bankDataProviders.updateConnectionDetails({
        connectionId: connectResult.connectionId,
        providerName: 'My Custom Name',
        raw: true,
      });

      expect(connection.providerName).toBe('My Custom Name');
      expect(connection.isActive).toBe(true);
    });

    it('should update credentials with a valid API key', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const { connection } = await helpers.bankDataProviders.updateConnectionDetails({
        connectionId: connectResult.connectionId,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY_2 },
        raw: true,
      });

      expect(connection.isActive).toBe(true);

      // Verify the connection still works with new credentials
      const { accounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectResult.connectionId,
        raw: true,
      });

      expect(accounts.length).toBeGreaterThan(0);
    });

    it('should fail to update credentials with an invalid API key', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      const result = await helpers.makeRequest({
        method: 'patch',
        url: `/bank-data-providers/connections/${connectResult.connectionId}`,
        payload: {
          credentials: { apiKey: INVALID_LUNCHFLOW_API_KEY },
        },
      });

      expect(result.status).toEqual(ERROR_CODES.Forbidden);

      // Original connection should still be active and working
      const { connection } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId: connectResult.connectionId,
        raw: true,
      });

      expect(connection.isActive).toBe(true);
    });

    it('should reactivate a deactivated connection after credential update', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.LUNCHFLOW,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY },
        raw: true,
      });

      // Simulate auth failures by trying to list accounts with bad credentials override
      // Force deactivation by making 2 consecutive auth failures via direct DB update
      const BankDataProviderConnections = (await import('@models/BankDataProviderConnections.model')).default;
      await BankDataProviderConnections.update(
        {
          isActive: false,
          metadata: { consecutiveAuthFailures: 2, deactivationReason: 'auth_failure' },
        },
        { where: { id: connectResult.connectionId } },
      );

      // Verify connection is deactivated
      const { connection: deactivated } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId: connectResult.connectionId,
        raw: true,
      });
      expect(deactivated.isActive).toBe(false);

      // Update credentials to reactivate
      const { connection: reactivated } = await helpers.bankDataProviders.updateConnectionDetails({
        connectionId: connectResult.connectionId,
        credentials: { apiKey: VALID_LUNCHFLOW_API_KEY_2 },
        raw: true,
      });

      expect(reactivated.isActive).toBe(true);
    });
  });
});
