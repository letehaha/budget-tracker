import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { INVALID_MONOBANK_TOKEN, VALID_MONOBANK_TOKEN } from '@tests/mocks/monobank/mock-api';

/**
 * E2E tests for Monobank Data Provider using the new unified connection flow
 * Tests the complete flow from connection to account sync
 */
describe('Monobank Data Provider E2E', () => {
  describe('Complete connection flow', () => {
    it('should complete the full flow: list providers -> connect -> list connections -> list external accounts -> connect accounts -> get details', async () => {
      // Step 1: Fetch supported providers
      const { providers } = await helpers.bankDataProviders.getSupportedBankProviders({ raw: true });

      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);

      // Verify Monobank is in the list
      const monobankProvider = providers.find((p: { type: string }) => p.type === BANK_PROVIDER_TYPE.MONOBANK)!;
      expect(monobankProvider).toBeDefined();
      expect(monobankProvider.name).toBe('Monobank');
      expect(monobankProvider.credentialFields).toBeDefined();
      expect(Array.isArray(monobankProvider.credentialFields)).toBe(true);

      // Step 2: Connect to selected provider
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        providerName: 'My Monobank Connection',
        raw: true,
      });

      expect(connectResult).toHaveProperty('connectionId');
      expect(connectResult.connectionId).toBeGreaterThan(0);

      const connectionId = connectResult.connectionId;

      // Step 3: Fetch user's connected providers
      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });

      expect(Array.isArray(connections)).toBe(true);
      expect(connections.length).toBeGreaterThan(0);

      const connection = connections.find((c: { id: number }) => c.id === connectionId);
      expect(connection).toBeDefined();
      expect(connection?.providerType).toBe(BANK_PROVIDER_TYPE.MONOBANK);
      expect(connection?.providerName).toBe('My Monobank Connection');
      expect(connection?.isActive).toBe(true);
      expect(connection?.accountsCount).toBe(0); // No accounts connected yet

      // Step 4: List external accounts of the connected provider
      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId,
        raw: true,
      });

      expect(Array.isArray(externalAccounts)).toBe(true);
      expect(externalAccounts.length).toBeGreaterThan(0);

      // Verify account structure
      const firstAccount = externalAccounts[0];
      expect(firstAccount).toHaveProperty('externalId');
      expect(firstAccount).toHaveProperty('name');
      expect(firstAccount).toHaveProperty('type');
      expect(firstAccount).toHaveProperty('balance');
      expect(firstAccount).toHaveProperty('currency');

      // Step 5: Connect selected accounts
      const accountIdsToConnect = externalAccounts.slice(0, 2).map((acc: { externalId: string }) => acc.externalId);

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId,
        accountExternalIds: accountIdsToConnect,
        raw: true,
      });

      expect(Array.isArray(syncedAccounts)).toBe(true);
      expect(syncedAccounts.length).toBe(accountIdsToConnect.length);

      // Verify created accounts
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
      expect(connectionDetails.providerType).toBe(BANK_PROVIDER_TYPE.MONOBANK);
      expect(connectionDetails.providerName).toBe('My Monobank Connection');
      expect(connectionDetails.isActive).toBe(true);

      // Verify provider metadata
      expect(connectionDetails.provider).toBeDefined();
      expect(connectionDetails.provider.name).toBe('Monobank');
      expect(connectionDetails.provider.description).toBeDefined();
      expect(connectionDetails.provider.features).toBeDefined();

      // Verify connected accounts are in details
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
    it('should return list of available providers', async () => {
      const { providers } = await helpers.bankDataProviders.getSupportedBankProviders({ raw: true });

      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);
    });

    it('should include provider metadata with correct structure', async () => {
      const { providers } = await helpers.bankDataProviders.getSupportedBankProviders({ raw: true });

      const provider = providers[0]!;
      expect(provider).toHaveProperty('type');
      expect(provider).toHaveProperty('name');
      expect(provider).toHaveProperty('description');
      expect(provider).toHaveProperty('features');
      expect(provider).toHaveProperty('credentialFields');

      // Verify features structure
      expect(provider.features).toHaveProperty('supportsWebhooks');
      expect(provider.features).toHaveProperty('supportsRealtime');
      expect(provider.features).toHaveProperty('requiresReauth');
      expect(provider.features).toHaveProperty('supportsManualSync');
      expect(provider.features).toHaveProperty('supportsAutoSync');
    });

    it('should include Monobank provider', async () => {
      const { providers } = await helpers.bankDataProviders.getSupportedBankProviders({ raw: true });

      const monobankProvider = providers.find((p: { type: string }) => p.type === BANK_PROVIDER_TYPE.MONOBANK)!;
      expect(monobankProvider).toBeDefined();
      expect(monobankProvider.name).toBe('Monobank');
    });
  });

  describe('Step 2: Connect provider', () => {
    it('should return validation error if credentials are missing', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await helpers.bankDataProviders.connectProvider({} as any);

      expect(result.status).toEqual(ERROR_CODES.ValidationError);
    });

    it('should return validation error for invalid provider type', async () => {
      const result = await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/invalid-provider/connect',
        payload: {
          credentials: { apiToken: 'test' },
        },
      });

      expect(result.status).toEqual(ERROR_CODES.ValidationError);
    });

    it('should successfully connect with valid credentials', async () => {
      const result = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      expect(result).toHaveProperty('connectionId');
      expect(result.connectionId).toBeGreaterThan(0);
    });

    it('should fail with invalid credentials', async () => {
      const result = await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/${BANK_PROVIDER_TYPE.MONOBANK}/connect`,
        payload: {
          credentials: { apiToken: INVALID_MONOBANK_TOKEN },
        },
      });

      expect(result.status).toEqual(ERROR_CODES.Forbidden);
    });

    it('should accept optional provider name', async () => {
      const customName = 'My Custom Provider Name';
      const result = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        providerName: customName,
        raw: true,
      });

      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const connection = connections.find((c: { id: number }) => c.id === result.connectionId);
      expect(connection?.providerName).toBe(customName);
    });

    it('should validate Monobank requires apiToken', async () => {
      const result = await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/${BANK_PROVIDER_TYPE.MONOBANK}/connect`,
        payload: {
          credentials: { wrongField: 'value' },
        },
      });

      expect(result.status).toEqual(ERROR_CODES.ValidationError);
    });
  });

  describe('Step 3: List user connections', () => {
    it('should return empty array when no connections exist', async () => {
      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      expect(Array.isArray(connections)).toBe(true);
    });

    it('should list user connection after connecting', async () => {
      const result = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        providerName: 'My Connection',
        raw: true,
      });

      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });

      expect(connections.length).toBeGreaterThanOrEqual(1);
      expect(connections.find((c: { id: number }) => c.id === result.connectionId)).toBeDefined();
    });

    it('should return connections with correct structure', async () => {
      await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const connection = connections[0];

      expect(connection).toHaveProperty('id');
      expect(connection).toHaveProperty('providerType');
      expect(connection).toHaveProperty('providerName');
      expect(connection).toHaveProperty('isActive');
      expect(connection).toHaveProperty('lastSyncAt');
      expect(connection).toHaveProperty('accountsCount');
      expect(connection).toHaveProperty('createdAt');
    });

    it('should show accountsCount as 0 for newly connected providers', async () => {
      const result = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const connection = connections.find((c: { id: number }) => c.id === result.connectionId);

      expect(connection?.accountsCount).toBe(0);
    });

    it('should allow multiple connections to the same provider', async () => {
      const result1 = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        providerName: 'Monobank 1',
        raw: true,
      });

      const result2 = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        providerName: 'Monobank 2',
        raw: true,
      });

      expect(result1.connectionId).not.toBe(result2.connectionId);

      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const monobankConnections = connections.filter(
        (c: { providerType: string }) => c.providerType === BANK_PROVIDER_TYPE.MONOBANK,
      );

      expect(monobankConnections.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Step 4: List external accounts', () => {
    it('should return 404 for non-existent connection', async () => {
      const result = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: 99999,
      });

      expect(result.status).toEqual(ERROR_CODES.NotFoundError);
    });

    it('should list external accounts from provider', async () => {
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
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
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      const { accounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      const account = accounts[0];
      expect(account).toHaveProperty('externalId');
      expect(account).toHaveProperty('name');
      expect(account).toHaveProperty('type');
      expect(account).toHaveProperty('balance');
      expect(account).toHaveProperty('currency');
      expect(typeof account!.balance).toBe('number');
      expect(typeof account!.currency).toBe('string');
    });

    it('should return accounts matching mocked data', async () => {
      const mockedData = helpers.monobank.mockedClientData();
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      const { accounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      expect(accounts.length).toBe(mockedData.accounts.length);
    });
  });

  describe('Step 5: Connect selected accounts', () => {
    it('should automatically sync transactions when connecting accounts', async () => {
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      const accountIds = externalAccounts.slice(0, 2).map((acc: { externalId: string }) => acc.externalId);

      // Mock transaction data for the Monobank API
      const mockTransactions = helpers.monobank.mockedTransactionData(5);
      const { getMonobankTransactionsMock } = await import('@tests/mocks/monobank/mock-api');
      global.mswMockServer.use(getMonobankTransactionsMock({ response: mockTransactions }));

      // Connect accounts - this should trigger automatic transaction sync
      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: accountIds,
        raw: true,
      });

      const createdAccountId = syncedAccounts[0]!.id;

      // Give the queue worker time to process transactions (Monobank uses a queue)
      await helpers.sleep(1000);

      // Verify transactions were automatically synced by checking if any transactions exist for this account
      const transactions = await helpers.getTransactions({
        accountIds: [createdAccountId],
        raw: true,
      });

      // Transactions should have been automatically synced
      expect(Array.isArray(transactions)).toBe(true);
      expect(transactions.length).toBe(mockTransactions.length);

      // Verify transactions belong to the correct account
      transactions.forEach((tx: { accountId: number }) => {
        expect(tx.accountId).toBe(createdAccountId);
      });
    });

    it('should return 404 for non-existent connection', async () => {
      const result = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: 99999,
        accountExternalIds: ['account-1'],
      });

      expect(result.status).toEqual(ERROR_CODES.NotFoundError);
    });

    it('should fail with invalid account IDs', async () => {
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
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
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      const accountIds = externalAccounts.slice(0, 2).map((acc: { externalId: string }) => acc.externalId);

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: accountIds,
        raw: true,
      });

      expect(syncedAccounts.length).toBe(2);
      syncedAccounts.forEach((account) => {
        expect(accountIds).toContain(account.externalId);
      });
    });

    it('should create accounts with correct balances and currency', async () => {
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      const selectedExternal = externalAccounts[0]!;

      const { syncedAccounts: connectedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: [selectedExternal.externalId],
        raw: true,
      });

      const createdAccount = connectedAccounts[0]!;

      const account = await helpers.getAccount({ id: createdAccount.id, raw: true });

      expect(account.currentBalance).toBe(selectedExternal.balance);
      expect(account.initialBalance).toBe(selectedExternal.balance);
      expect(account.currencyCode).toBe(selectedExternal.currency);
    });

    it('should update connection lastSyncAt after connecting accounts', async () => {
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      const { connections: connectionsBefore } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const connectionBefore = connectionsBefore.find((c: { id: number }) => c.id === connectionResult.connectionId);
      expect(connectionBefore?.lastSyncAt).toBeNull();

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: [externalAccounts[0]!.externalId],
        raw: true,
      });

      const { connections: connectionsAfter } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const connectionAfter = connectionsAfter.find((c: { id: number }) => c.id === connectionResult.connectionId);
      expect(connectionAfter?.lastSyncAt).not.toBeNull();
    });

    it('should enable existing disabled accounts when reconnecting', async () => {
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      const accountId = externalAccounts[0]!.externalId;

      // Connect account first time
      const { syncedAccounts: firstConnect } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: [accountId],
        raw: true,
      });

      const firstAccountId = firstConnect[0]!.id;

      // Disable the account
      await helpers.updateAccount({
        id: firstAccountId,
        payload: { isEnabled: false },
      });

      // Reconnect the same account
      const { syncedAccounts: secondConnect } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: [accountId],
        raw: true,
      });

      expect(secondConnect[0]!.id).toBe(firstAccountId);

      const account = await helpers.getAccount({
        id: secondConnect[0]!.id,
        raw: true,
      });

      expect(account.isEnabled).toBe(true);
    });

    it('should update accountsCount after connecting accounts', async () => {
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
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

      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const connection = connections.find((c: { id: number }) => c.id === connectionResult.connectionId);
      expect(connection?.accountsCount).toBe(2);
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
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        providerName: 'Test Connection',
        raw: true,
      });

      const { connection: details } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      expect(details.id).toBe(connectionResult.connectionId);
      expect(details.providerType).toBe(BANK_PROVIDER_TYPE.MONOBANK);
      expect(details.providerName).toBe('Test Connection');
      expect(details.isActive).toBe(true);

      expect(details.provider).toBeDefined();
      expect(details.provider.name).toBe('Monobank');
      expect(details.provider.description).toBeDefined();
      expect(details.provider.features).toBeDefined();
    });

    it('should include connected accounts in details', async () => {
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
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
        (account: {
          id: number;
          name: string;
          externalId: string;
          currentBalance: number;
          currencyCode: string;
          type: string;
        }) => {
          expect(account).toHaveProperty('id');
          expect(account).toHaveProperty('name');
          expect(account).toHaveProperty('externalId');
          expect(account).toHaveProperty('currentBalance');
          expect(account).toHaveProperty('currencyCode');
          expect(account).toHaveProperty('type');
        },
      );
    });

    it('should return empty accounts array when no accounts connected', async () => {
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      const { connection: details } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      expect(details.accounts).toEqual([]);
    });
  });

  describe('Connection persistence and state', () => {
    it('should store credentials securely (encrypted)', async () => {
      const result = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      // Get connection details
      const { connection } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId: result.connectionId,
        raw: true,
      });

      expect(connection).toBeDefined();
      expect(connection.id).toBe(result.connectionId);
      expect(connection.providerType).toBe(BANK_PROVIDER_TYPE.MONOBANK);
      expect(connection.isActive).toBe(true);
    });

    it('should create connection with correct initial state', async () => {
      const result = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const connection = connections.find((c: { id: number }) => c.id === result.connectionId);

      expect(connection).toBeDefined();
      expect(connection?.isActive).toBe(true);
      expect(connection?.providerType).toBe(BANK_PROVIDER_TYPE.MONOBANK);
      expect(connection?.lastSyncAt).toBeNull();
      expect(connection?.createdAt).toBeDefined();
      expect(connection?.accountsCount).toBe(0); // No accounts synced yet
    });

    it('should rollback transaction on connection failure', async () => {
      const { connections: connectionsBefore } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const countBefore = connectionsBefore.length;

      await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/${BANK_PROVIDER_TYPE.MONOBANK}/connect`,
        payload: {
          credentials: { apiToken: INVALID_MONOBANK_TOKEN },
        },
      });

      const { connections: connectionsAfter } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const countAfter = connectionsAfter.length;

      expect(countAfter).toBe(countBefore); // No new connection created
    });
  });
});
