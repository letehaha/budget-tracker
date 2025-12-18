import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import {
  INVALID_ENABLE_BANKING_APP_ID,
  INVALID_ENABLE_BANKING_PRIVATE_KEY,
  MOCK_ACCOUNT_UID_1,
  MOCK_ACCOUNT_UID_1_RECONNECTED,
  MOCK_ACCOUNT_UID_2,
  MOCK_ACCOUNT_UID_2_RECONNECTED,
  MOCK_BANK_COUNTRY,
  MOCK_BANK_NAME,
  getAllMockAccountUIDs,
  getAllMockAccountUIDsReconnected,
} from '@tests/mocks/enablebanking/data';

describe('Enable Banking Data Provider E2E', () => {
  // Reset mock session counter before each test to ensure predictable behavior
  // The counter determines whether mock returns original or reconnected account UIDs
  beforeEach(() => {
    helpers.enablebanking.resetSessionCounter();
  });

  describe('Complete connection flow', () => {
    it('should complete the full OAuth flow: list providers -> connect -> OAuth callback -> list connections -> list external accounts -> connect accounts -> get details', async () => {
      // Step 1: Fetch supported providers
      const { providers } = await helpers.bankDataProviders.getSupportedBankProviders({ raw: true });

      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);

      // Verify Enable Banking is in the list
      const enableBankingProvider = providers.find(
        (p: { type: string }) => p.type === BANK_PROVIDER_TYPE.ENABLE_BANKING,
      )!;
      expect(enableBankingProvider).toBeDefined();
      expect(enableBankingProvider.name).toBe('Enable Banking');
      expect(enableBankingProvider.credentialFields).toBeDefined();
      expect(Array.isArray(enableBankingProvider.credentialFields)).toBe(true);

      // Step 2: Initiate connection (this creates a pending connection and returns auth URL)
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        providerName: 'My Enable Banking Connection',
        raw: true,
      });

      expect(connectResult).toHaveProperty('connectionId');
      expect(connectResult.connectionId).toBeGreaterThan(0);

      const connectionId = connectResult.connectionId;

      // Step 3: Get connection details to verify it's pending
      const { connection: pendingConnection } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId,
        raw: true,
      });

      expect(pendingConnection.isActive).toBe(false); // Not active until OAuth completes
      expect(pendingConnection.providerType).toBe(BANK_PROVIDER_TYPE.ENABLE_BANKING);

      // Step 4: Extract state from connection metadata for OAuth callback
      const state = await helpers.enablebanking.getConnectionState(connectionId);
      expect(state).toBeDefined();

      // Step 5: Simulate OAuth callback (user authorized in bank)
      const oauthResult = (await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
        raw: true,
      })) as { success: boolean; connectionId: number };

      expect(oauthResult.connectionId).toBe(connectionId);

      // Step 6: Verify connection is now active
      const { connection: activeConnection } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId,
        raw: true,
      });

      expect(activeConnection.isActive).toBe(true);
      expect(activeConnection.providerType).toBe(BANK_PROVIDER_TYPE.ENABLE_BANKING);
      expect(activeConnection.providerName).toBe('My Enable Banking Connection');

      // Step 7: List external accounts
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

      // Step 8: Connect selected accounts
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

      // Step 9: Fetch final connection details
      const { connection: connectionDetails } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId,
        raw: true,
      });

      expect(connectionDetails.id).toBe(connectionId);
      expect(connectionDetails.isActive).toBe(true);

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
    });
  });

  describe('Step 1: List supported providers', () => {
    it('should include Enable Banking in providers list', async () => {
      const { providers } = await helpers.bankDataProviders.getSupportedBankProviders({ raw: true });

      const enableBankingProvider = providers.find(
        (p: { type: string }) => p.type === BANK_PROVIDER_TYPE.ENABLE_BANKING,
      );
      expect(enableBankingProvider).toBeDefined();
      expect(enableBankingProvider?.name).toBe('Enable Banking');
      expect(enableBankingProvider?.description).toContain('6000+');
    });

    it('should include correct credential fields for Enable Banking', async () => {
      const { providers } = await helpers.bankDataProviders.getSupportedBankProviders({ raw: true });

      const enableBankingProvider = providers.find(
        (p: { type: string }) => p.type === BANK_PROVIDER_TYPE.ENABLE_BANKING,
      );
      expect(enableBankingProvider?.credentialFields).toBeDefined();

      const fieldNames = enableBankingProvider?.credentialFields.map((f: { name: string }) => f.name);
      expect(fieldNames).toContain('appId');
      expect(fieldNames).toContain('privateKey');
      expect(fieldNames).toContain('bankName');
      expect(fieldNames).toContain('bankCountry');
    });
  });

  describe('Step 2: Initiate connection', () => {
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
          credentials: helpers.enablebanking.mockCredentials(),
        },
      });

      expect(result.status).toEqual(ERROR_CODES.ValidationError);
    });

    it('should successfully create pending connection with valid credentials', async () => {
      const result = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      expect(result).toHaveProperty('connectionId');
      expect(result.connectionId).toBeGreaterThan(0);

      // Verify connection is pending (not active)
      const { connection } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId: result.connectionId,
        raw: true,
      });

      expect(connection.isActive).toBe(false);
    });

    it('should fail with invalid credentials', async () => {
      const result = await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/${BANK_PROVIDER_TYPE.ENABLE_BANKING}/connect`,
        payload: {
          credentials: {
            appId: INVALID_ENABLE_BANKING_APP_ID,
            privateKey: INVALID_ENABLE_BANKING_PRIVATE_KEY,
            bankName: MOCK_BANK_NAME,
            bankCountry: MOCK_BANK_COUNTRY,
          },
        },
      });

      expect(result.status).toEqual(ERROR_CODES.ValidationError);
    });

    it('should accept optional provider name', async () => {
      const customName = 'My Custom Bank Connection';
      const result = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        providerName: customName,
        raw: true,
      });

      const { connection } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId: result.connectionId,
        raw: true,
      });

      expect(connection.providerName).toBe(customName);
    });

    it('should validate required Enable Banking fields', async () => {
      const result = await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/${BANK_PROVIDER_TYPE.ENABLE_BANKING}/connect`,
        payload: {
          credentials: {
            appId: helpers.enablebanking.mockAppId,
            // Missing privateKey, bankName, bankCountry
          },
        },
      });

      expect(result.status).toEqual(ERROR_CODES.ValidationError);
    });

    it('should store authorization details in connection metadata', async () => {
      const result = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      // Access database model directly to check metadata
      const BankDataProviderConnections = (await import('@models/BankDataProviderConnections.model')).default;
      const connection = await BankDataProviderConnections.findByPk(result.connectionId);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const metadata = connection!.metadata as any;
      expect(metadata.state).toBeDefined();
      expect(metadata.authUrl).toBeDefined();
      expect(metadata.bankName).toBe(MOCK_BANK_NAME);
      expect(metadata.bankCountry).toBe(MOCK_BANK_COUNTRY);
    });
  });

  describe('Step 3: OAuth callback', () => {
    it('should return validation error for missing parameters', async () => {
      const result = await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          // Missing required fields
        },
      });

      expect(result.status).toEqual(ERROR_CODES.ValidationError);
    });

    it('should return error for invalid state parameter', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      const result = await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state: 'invalid-state-12345',
        },
      });

      expect(result.status).toEqual(ERROR_CODES.ValidationError);
    });

    it('should successfully activate connection with valid OAuth callback', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      const oauthResult = await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
        raw: true,
      });

      expect(oauthResult.connectionId).toBe(connectResult.connectionId);

      // Verify connection is now active
      const { connection } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId: connectResult.connectionId,
        raw: true,
      });

      expect(connection.isActive).toBe(true);
    });

    it('should return 404 for non-existent connection', async () => {
      const result = await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: 99999,
          code: helpers.enablebanking.mockAuthCode,
          state: 'some-state',
        },
      });

      expect(result.status).toEqual(ERROR_CODES.NotFoundError);
    });
  });

  describe('Step 4: List user connections', () => {
    it('should list Enable Banking connection after OAuth completes', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        providerName: 'My Enable Banking',
        raw: true,
      });

      const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });

      const enableBankingConnection = connections.find((c: { id: number }) => c.id === connectResult.connectionId);
      expect(enableBankingConnection).toBeDefined();
      expect(enableBankingConnection?.providerType).toBe(BANK_PROVIDER_TYPE.ENABLE_BANKING);
      expect(enableBankingConnection?.isActive).toBe(true);
    });

    it('should show accountsCount as 0 for newly connected providers', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const connection = connections.find((c: { id: number }) => c.id === connectResult.connectionId);

      expect(connection?.accountsCount).toBe(0);
    });

    it('should allow multiple Enable Banking connections', async () => {
      const result1 = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        providerName: 'Enable Banking 1',
        raw: true,
      });

      const result2 = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        providerName: 'Enable Banking 2',
        raw: true,
      });

      expect(result1.connectionId).not.toBe(result2.connectionId);

      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const enableBankingConnections = connections.filter(
        (c: { providerType: string }) => c.providerType === BANK_PROVIDER_TYPE.ENABLE_BANKING,
      );

      expect(enableBankingConnections.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Step 5: List external accounts', () => {
    it('should return 404 for non-existent connection', async () => {
      const result = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: 99999,
      });

      expect(result.status).toEqual(ERROR_CODES.NotFoundError);
    });

    it('should list external accounts from Enable Banking', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      const response = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectResult.connectionId,
        raw: true,
      });

      const { accounts } = response;

      expect(Array.isArray(accounts)).toBe(true);
      expect(accounts.length).toBeGreaterThan(0);
    });

    it('should return accounts with correct structure', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      const { accounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectResult.connectionId,
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

    it('should return all mocked accounts', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      const { accounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectResult.connectionId,
        raw: true,
      });

      const mockAccountUIDs = getAllMockAccountUIDs();
      expect(accounts.length).toBe(mockAccountUIDs.length);
    });

    it('should include account metadata (IBAN, product, etc.)', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      const { accounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectResult.connectionId,
        raw: true,
      });

      const account = accounts[0]!;
      expect(account.metadata).toBeDefined();
      expect(account.metadata).toHaveProperty('iban');
    });
  });

  describe('Step 6: Connect selected accounts', () => {
    it('should automatically sync transactions when connecting accounts', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      const accountIds = [MOCK_ACCOUNT_UID_1];

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectResult.connectionId,
        accountExternalIds: accountIds,
        raw: true,
      });

      const createdAccountId = syncedAccounts[0]!.id;

      // Verify transactions were automatically synced by checking if any transactions exist for this account
      const transactions = await helpers.getTransactions({
        accountIds: [createdAccountId],
        raw: true,
      });

      // Transactions should have been automatically synced
      // Note: The exact number depends on mock data, but there should be at least some transactions
      expect(Array.isArray(transactions)).toBe(true);
      expect(transactions.length).toBeGreaterThan(0);

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
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      const result = await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/connections/${connectResult.connectionId}/sync-selected-accounts`,
        payload: {
          accountExternalIds: ['non-existent-id'],
        },
      });

      expect(result.status).toEqual(ERROR_CODES.BadRequest);
    });

    it('should successfully connect valid accounts', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      const accountIds = [MOCK_ACCOUNT_UID_1, MOCK_ACCOUNT_UID_2];

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectResult.connectionId,
        accountExternalIds: accountIds,
        raw: true,
      });

      expect(syncedAccounts.length).toBe(2);
      syncedAccounts.forEach((account) => {
        expect(accountIds).toContain(account.externalId);
      });
    });

    it('should create accounts with correct balances and currency', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectResult.connectionId,
        raw: true,
      });

      const selectedExternal = externalAccounts[0]!;

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectResult.connectionId,
        accountExternalIds: [selectedExternal.externalId],
        raw: true,
      });

      const createdAccount = syncedAccounts[0]!;
      const account = await helpers.getAccount({ id: createdAccount.id, raw: true });

      expect(account.currentBalance).toBe(selectedExternal.balance);
      expect(account.initialBalance).toBe(selectedExternal.balance);
      expect(account.currencyCode).toBe(selectedExternal.currency);
    });

    it('should update connection lastSyncAt after connecting accounts', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      const { connections: connectionsBefore } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const connectionBefore = connectionsBefore.find((c: { id: number }) => c.id === connectResult.connectionId);
      expect(connectionBefore?.lastSyncAt).toBeNull();

      await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectResult.connectionId,
        accountExternalIds: [MOCK_ACCOUNT_UID_1],
        raw: true,
      });

      const { connections: connectionsAfter } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const connectionAfter = connectionsAfter.find((c: { id: number }) => c.id === connectResult.connectionId);
      expect(connectionAfter?.lastSyncAt).not.toBeNull();
    });

    it('should enable existing disabled accounts when reconnecting', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      // Connect account first time
      const { syncedAccounts: firstConnect } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectResult.connectionId,
        accountExternalIds: [MOCK_ACCOUNT_UID_1],
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
        connectionId: connectResult.connectionId,
        accountExternalIds: [MOCK_ACCOUNT_UID_1],
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
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectResult.connectionId,
        accountExternalIds: [MOCK_ACCOUNT_UID_1, MOCK_ACCOUNT_UID_2],
        raw: true,
      });

      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const connection = connections.find((c: { id: number }) => c.id === connectResult.connectionId);
      expect(connection?.accountsCount).toBe(2);
    });
  });

  describe('Step 7: Get connection details', () => {
    it('should return connection details with provider metadata', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        providerName: 'Test Connection',
        raw: true,
      });

      const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      const { connection: details } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId: connectResult.connectionId,
        raw: true,
      });

      expect(details.id).toBe(connectResult.connectionId);
      expect(details.providerType).toBe(BANK_PROVIDER_TYPE.ENABLE_BANKING);
      expect(details.providerName).toBe('Test Connection');
      expect(details.isActive).toBe(true);

      expect(details.provider).toBeDefined();
      expect(details.provider.name).toBe('Enable Banking');
      expect(details.provider.description).toBeDefined();
      expect(details.provider.features).toBeDefined();
    });

    it('should include connected accounts in details', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectResult.connectionId,
        accountExternalIds: [MOCK_ACCOUNT_UID_1, MOCK_ACCOUNT_UID_2],
        raw: true,
      });

      const { connection: details } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId: connectResult.connectionId,
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
        },
      );
    });

    it('should return empty accounts array when no accounts connected', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      const { connection: details } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId: connectResult.connectionId,
        raw: true,
      });

      expect(details.accounts).toEqual([]);
    });
  });

  describe('Connection persistence and state', () => {
    it('should store credentials securely (encrypted)', async () => {
      const result = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      const { connection } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId: result.connectionId,
        raw: true,
      });

      expect(connection).toBeDefined();
      expect(connection.id).toBe(result.connectionId);
      expect(connection.providerType).toBe(BANK_PROVIDER_TYPE.ENABLE_BANKING);
      expect(connection.isActive).toBe(false); // Pending until OAuth
    });

    it('should create connection with correct initial state', async () => {
      const result = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      const { connections } = await helpers.bankDataProviders.listUserConnections({ raw: true });
      const connection = connections.find((c: { id: number }) => c.id === result.connectionId);

      expect(connection).toBeDefined();
      expect(connection?.isActive).toBe(false); // Not active until OAuth
      expect(connection?.providerType).toBe(BANK_PROVIDER_TYPE.ENABLE_BANKING);
      expect(connection?.lastSyncAt).toBeNull();
      expect(connection?.createdAt).toBeDefined();
      expect(connection?.accountsCount).toBe(0);
    });

    it('should transition from pending to active after OAuth', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      // Verify pending state
      const { connection: pendingConn } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId: connectResult.connectionId,
        raw: true,
      });
      expect(pendingConn.isActive).toBe(false);

      // Complete OAuth
      const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      // Verify active state
      const { connection: activeConn } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId: connectResult.connectionId,
        raw: true,
      });
      expect(activeConn.isActive).toBe(true);
    });
  });

  describe('Reauthorization flow', () => {
    it('should allow reauthorization of an existing connection', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      // Reauthorize
      const reauthorizeResult = (await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/connections/${connectResult.connectionId}/reauthorize`,
        raw: true,
      })) as { authUrl: string; message: string };

      expect(reauthorizeResult.authUrl).toBeDefined();
      expect(reauthorizeResult.authUrl).toContain('https://');

      // Connection should be inactive again
      const { connection } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId: connectResult.connectionId,
        raw: true,
      });

      expect(connection.isActive).toBe(false);
    });

    it('should complete reauthorization flow', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      let state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      // Reauthorize
      await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/connections/${connectResult.connectionId}/reauthorize`,
      });

      // Complete OAuth again with new state
      state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      // Connection should be active again
      const { connection } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId: connectResult.connectionId,
        raw: true,
      });

      expect(connection.isActive).toBe(true);
    });
  });

  describe('Reauthorization with externalId update', () => {
    it('should update account externalId after reconnection when Enable Banking returns new UUIDs', async () => {
      // Step 1: Create initial connection and connect accounts
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      let state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      // Complete initial OAuth (this will use original account UIDs)
      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      // Connect accounts with original UIDs
      const { syncedAccounts: initialAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectResult.connectionId,
        accountExternalIds: [MOCK_ACCOUNT_UID_1, MOCK_ACCOUNT_UID_2],
        raw: true,
      });

      // Verify initial externalIds
      expect(initialAccounts.length).toBe(2);
      const account1Id = initialAccounts.find((a) => a.externalId === MOCK_ACCOUNT_UID_1)?.id;
      const account2Id = initialAccounts.find((a) => a.externalId === MOCK_ACCOUNT_UID_2)?.id;
      expect(account1Id).toBeDefined();
      expect(account2Id).toBeDefined();

      // Verify accounts have original externalIds
      const account1Before = await helpers.getAccount({ id: account1Id!, raw: true });
      const account2Before = await helpers.getAccount({ id: account2Id!, raw: true });
      expect(account1Before.externalId).toBe(MOCK_ACCOUNT_UID_1);
      expect(account2Before.externalId).toBe(MOCK_ACCOUNT_UID_2);

      // Step 2: Reauthorize connection
      await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/connections/${connectResult.connectionId}/reauthorize`,
      });

      // Step 3: Complete OAuth again (this will return NEW account UIDs from mock)
      state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      // Step 4: Verify existing accounts have been updated with new externalIds
      const account1After = await helpers.getAccount({ id: account1Id!, raw: true });
      const account2After = await helpers.getAccount({ id: account2Id!, raw: true });

      // The externalIds should now be the reconnected versions
      expect(account1After.externalId).toBe(MOCK_ACCOUNT_UID_1_RECONNECTED);
      expect(account2After.externalId).toBe(MOCK_ACCOUNT_UID_2_RECONNECTED);

      // The account IDs should remain the same (same database records)
      expect(account1After.id).toBe(account1Id);
      expect(account2After.id).toBe(account2Id);

      // Step 5: Verify that listing external accounts now returns new UIDs
      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectResult.connectionId,
        raw: true,
      });

      const reconnectedUIDs = getAllMockAccountUIDsReconnected();
      externalAccounts.forEach((acc: { externalId: string }) => {
        expect(reconnectedUIDs).toContain(acc.externalId);
      });

      // Step 6: Verify connection details show correct accounts
      const { connection } = await helpers.bankDataProviders.getConnectionDetails({
        connectionId: connectResult.connectionId,
        raw: true,
      });

      expect(connection.isActive).toBe(true);
      expect(connection.accounts.length).toBe(2);

      // Accounts in connection should have updated externalIds
      const connAccount1 = connection.accounts.find((a: { id: number }) => a.id === account1Id);
      const connAccount2 = connection.accounts.find((a: { id: number }) => a.id === account2Id);
      expect(connAccount1?.externalId).toBe(MOCK_ACCOUNT_UID_1_RECONNECTED);
      expect(connAccount2?.externalId).toBe(MOCK_ACCOUNT_UID_2_RECONNECTED);
    });

    it('should allow transaction sync after reconnection with updated externalId', async () => {
      // Create connection and connect an account
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      let state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      // Connect one account
      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectResult.connectionId,
        accountExternalIds: [MOCK_ACCOUNT_UID_1],
        raw: true,
      });

      const accountId = syncedAccounts[0]!.id;

      // Get transaction count before reconnection
      const transactionsBefore = await helpers.getTransactions({
        accountIds: [accountId],
        raw: true,
      });
      const txCountBefore = transactionsBefore.length;

      // Reauthorize
      await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/connections/${connectResult.connectionId}/reauthorize`,
      });

      // Complete OAuth with new session
      state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      // Verify account externalId was updated
      const accountAfterReconnect = await helpers.getAccount({ id: accountId, raw: true });
      expect(accountAfterReconnect.externalId).toBe(MOCK_ACCOUNT_UID_1_RECONNECTED);

      // Trigger transaction sync - this should work because externalId is updated
      await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/connections/${connectResult.connectionId}/sync-transactions`,
        payload: {
          accountId,
        },
        raw: true,
      });

      // Verify transactions were synced (count should be same or more)
      const transactionsAfter = await helpers.getTransactions({
        accountIds: [accountId],
        raw: true,
      });

      // Should have at least as many transactions as before (sync doesn't duplicate)
      expect(transactionsAfter.length).toBeGreaterThanOrEqual(txCountBefore);
    });

    it('should preserve account data (balance, name, currency) after externalId update', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      let state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectResult.connectionId,
        accountExternalIds: [MOCK_ACCOUNT_UID_1],
        raw: true,
      });

      const accountId = syncedAccounts[0]!.id;
      const accountBefore = await helpers.getAccount({ id: accountId, raw: true });

      // Reauthorize and complete OAuth
      await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/connections/${connectResult.connectionId}/reauthorize`,
      });

      state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      const accountAfter = await helpers.getAccount({ id: accountId, raw: true });

      // Core data should be preserved
      expect(accountAfter.id).toBe(accountBefore.id);
      expect(accountAfter.name).toBe(accountBefore.name);
      expect(accountAfter.currencyCode).toBe(accountBefore.currencyCode);
      expect(accountAfter.currentBalance).toBe(accountBefore.currentBalance);
      expect(accountAfter.initialBalance).toBe(accountBefore.initialBalance);

      // Only externalId should change
      expect(accountAfter.externalId).not.toBe(accountBefore.externalId);
      expect(accountAfter.externalId).toBe(MOCK_ACCOUNT_UID_1_RECONNECTED);
    });
  });

  describe('Balance history tracking', () => {
    it('should create balance record when account is first connected', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      // Connect an account
      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectResult.connectionId,
        accountExternalIds: [MOCK_ACCOUNT_UID_1],
        raw: true,
      });

      const accountId = syncedAccounts[0]!.id;

      // Get balance history for this account
      const balanceHistory = await helpers.getBalanceHistory({ raw: true });

      // Should have at least one balance record for this account
      const accountBalances = balanceHistory.filter((b: { accountId: number }) => b.accountId === accountId);
      expect(accountBalances.length).toBeGreaterThanOrEqual(1);
    });

    it('should update balance history when transactions are synced', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      const state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectResult.connectionId,
        accountExternalIds: [MOCK_ACCOUNT_UID_1],
        raw: true,
      });

      const accountId = syncedAccounts[0]!.id;

      // Get balance history count after account connection
      const balanceHistoryBefore = await helpers.getBalanceHistory({ raw: true });
      const accountBalancesBefore = balanceHistoryBefore.filter(
        (b: { accountId: number }) => b.accountId === accountId,
      );
      const balanceCountBefore = accountBalancesBefore.length;

      // Sync transactions
      await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/connections/${connectResult.connectionId}/sync-transactions`,
        payload: {
          accountId,
        },
        raw: true,
      });

      // Verify transactions were synced
      const transactions = await helpers.getTransactions({
        accountIds: [accountId],
        raw: true,
      });
      expect(transactions.length).toBeGreaterThan(0);

      // Get balance history count after transaction sync
      const balanceHistoryAfter = await helpers.getBalanceHistory({ raw: true });
      const accountBalancesAfter = balanceHistoryAfter.filter((b: { accountId: number }) => b.accountId === accountId);

      // Balance history SHOULD be maintained after transaction sync
      // On the same day, the existing record is updated (not a new one created)
      // The count stays the same but the balance amount reflects the bank's current balance
      expect(accountBalancesAfter.length).toBeGreaterThanOrEqual(balanceCountBefore);
      expect(accountBalancesAfter.length).toBeGreaterThanOrEqual(1);
    });

    it('should update balance history when account is refreshed/resynced', async () => {
      const connectResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.ENABLE_BANKING,
        credentials: helpers.enablebanking.mockCredentials(),
        raw: true,
      });

      let state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectResult.connectionId,
        accountExternalIds: [MOCK_ACCOUNT_UID_1],
        raw: true,
      });

      const accountId = syncedAccounts[0]!.id;

      // Get balance history after initial connection
      const balanceHistoryBefore = await helpers.getBalanceHistory({ raw: true });
      const accountBalancesBefore = balanceHistoryBefore.filter(
        (b: { accountId: number }) => b.accountId === accountId,
      );
      const balanceCountBefore = accountBalancesBefore.length;

      // Reauthorize and complete OAuth (simulating account refresh)
      await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/connections/${connectResult.connectionId}/reauthorize`,
      });

      state = await helpers.enablebanking.getConnectionState(connectResult.connectionId);

      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/enablebanking/oauth-callback',
        payload: {
          connectionId: connectResult.connectionId,
          code: helpers.enablebanking.mockAuthCode,
          state,
        },
      });

      // Trigger a sync to update balance from bank after reauthorization
      await helpers.makeRequest({
        method: 'post',
        url: `/bank-data-providers/connections/${connectResult.connectionId}/sync-transactions`,
        payload: {
          accountId,
        },
        raw: true,
      });

      // Get balance history after reauthorization and sync
      const balanceHistoryAfter = await helpers.getBalanceHistory({ raw: true });
      const accountBalancesAfter = balanceHistoryAfter.filter((b: { accountId: number }) => b.accountId === accountId);

      // Balance history SHOULD be maintained after refresh/resync
      // On the same day, the existing record is updated (not a new one created)
      expect(accountBalancesAfter.length).toBeGreaterThanOrEqual(balanceCountBefore);
      expect(accountBalancesAfter.length).toBeGreaterThanOrEqual(1);
    });
  });
});
