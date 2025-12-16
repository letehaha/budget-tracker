import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { VALID_MONOBANK_TOKEN } from '@tests/mocks/monobank/mock-api';

describe('Sync Flow - Account isEnabled Flag', () => {
  describe('Enabled account sync behavior', () => {
    it('should sync enabled accounts when manual sync is triggered', async () => {
      // Setup: Connect provider and enabled account
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      // Connect selected accounts
      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: [externalAccounts[0]!.externalId],
        raw: true,
      });

      const accountId = syncedAccounts[0]!.id;

      // Verify account is enabled by default
      const account = await helpers.getAccount({ id: accountId, raw: true });
      expect(account.isEnabled).toBe(true);

      // Test: Trigger sync
      const response = await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/sync/trigger',
      });

      expect(response.status).toBe(200);
      expect(response.body.response.totalAccounts).toBe(1);
      expect(response.body.response.accountResults.length).toBe(1);
      expect(response.body.response.accountResults[0]!.accountId).toBe(accountId);
      expect(['success', 'skipped']).toContain(response.body.response.accountResults[0]!.status);
    });

    it('should include enabled accounts in sync status', async () => {
      // Setup: Connect provider and account
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

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

      // Test: Get sync status - enabled account should be included
      const response = await helpers.makeRequest({
        method: 'get',
        url: '/bank-data-providers/sync/status',
      });

      expect(response.status).toBe(200);
      expect(response.body.response.accounts.length).toBe(1);
      expect(response.body.response.accounts[0]!.accountId).toBe(accountId);
      expect(response.body.response.summary.total).toBe(1);
    });
  });

  describe('Disabled account sync behavior', () => {
    it('should NOT sync disabled accounts when manual sync is triggered', async () => {
      // Setup: Connect provider and account
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

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

      // Disable the account
      await helpers.updateAccount({
        id: accountId,
        payload: {
          isEnabled: false,
        },
        raw: true,
      });

      // Verify account is disabled
      const disabledAccount = await helpers.getAccount({ id: accountId, raw: true });
      expect(disabledAccount.isEnabled).toBe(false);

      // Test: Trigger sync - disabled account should not be included
      const response = await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/sync/trigger',
      });

      expect(response.status).toBe(200);
      expect(response.body.response.totalAccounts).toBe(0);
      expect(response.body.response.syncedAccounts).toBe(0);
      expect(response.body.response.accountResults).toEqual([]);
    });

    it('should NOT include disabled accounts in sync status', async () => {
      // Setup: Connect provider and account
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

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

      // Disable the account
      await helpers.updateAccount({
        id: accountId,
        payload: {
          isEnabled: false,
        },
        raw: true,
      });

      // Test: Get sync status - disabled account should not be included
      const response = await helpers.makeRequest({
        method: 'get',
        url: '/bank-data-providers/sync/status',
      });

      expect(response.status).toBe(200);
      expect(response.body.response.accounts.length).toBe(0);
      expect(response.body.response.summary.total).toBe(0);
    });

    it('should exclude disabled accounts from check-sync endpoint', async () => {
      // Setup: Connect provider and account
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

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

      // Disable the account
      await helpers.updateAccount({
        id: accountId,
        payload: {
          isEnabled: false,
        },
        raw: true,
      });

      // Test: Check sync should not include disabled accounts
      const response = await helpers.makeRequest({
        method: 'get',
        url: '/bank-data-providers/sync/check',
      });

      expect(response.status).toBe(200);
      expect(response.body.response.totalAccounts).toBe(0);
    });
  });

  describe('Mixed enabled/disabled accounts sync behavior', () => {
    it('should sync only enabled accounts when multiple accounts are connected', async () => {
      // Setup: Connect provider
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      // Connect 2 accounts
      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: externalAccounts.slice(0, 2).map((a) => a.externalId),
        raw: true,
      });

      expect(syncedAccounts.length).toBe(2);
      const enabledAccountId = syncedAccounts[0]!.id;
      const disabledAccountId = syncedAccounts[1]!.id;

      // Disable the second account
      await helpers.updateAccount({
        id: disabledAccountId,
        payload: {
          isEnabled: false,
        },
        raw: true,
      });

      // Test: Trigger sync - only enabled account should be synced
      const response = await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/sync/trigger',
      });

      expect(response.status).toBe(200);
      expect(response.body.response.totalAccounts).toBe(1);
      expect(response.body.response.accountResults.length).toBe(1);
      expect(response.body.response.accountResults[0]!.accountId).toBe(enabledAccountId);
    });

    it('should include only enabled accounts in sync status with multiple accounts', async () => {
      // Setup: Connect provider
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      // Connect 3 accounts
      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: externalAccounts.slice(0, 3).map((a) => a.externalId),
        raw: true,
      });

      expect(syncedAccounts.length).toBe(3);

      // Disable 2 accounts, keep 1 enabled
      await helpers.updateAccount({
        id: syncedAccounts[0]!.id,
        payload: { isEnabled: false },
        raw: true,
      });

      await helpers.updateAccount({
        id: syncedAccounts[2]!.id,
        payload: { isEnabled: false },
        raw: true,
      });

      // Test: Get sync status - only the middle (enabled) account should be included
      const response = await helpers.makeRequest({
        method: 'get',
        url: '/bank-data-providers/sync/status',
      });

      expect(response.status).toBe(200);
      expect(response.body.response.accounts.length).toBe(1);
      expect(response.body.response.accounts[0]!.accountId).toBe(syncedAccounts[1]!.id);
      expect(response.body.response.summary.total).toBe(1);
    });
  });

  describe('Account enable/disable state transitions', () => {
    it('should include account in sync after re-enabling it', async () => {
      // Setup: Connect provider and account
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

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

      // Disable the account
      await helpers.updateAccount({
        id: accountId,
        payload: { isEnabled: false },
        raw: true,
      });

      // Verify not included in sync status
      let statusResponse = await helpers.makeRequest({
        method: 'get',
        url: '/bank-data-providers/sync/status',
      });
      expect(statusResponse.body.response.accounts.length).toBe(0);

      // Re-enable the account
      await helpers.updateAccount({
        id: accountId,
        payload: { isEnabled: true },
        raw: true,
      });

      // Test: Account should now be included in sync status
      statusResponse = await helpers.makeRequest({
        method: 'get',
        url: '/bank-data-providers/sync/status',
      });

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.response.accounts.length).toBe(1);
      expect(statusResponse.body.response.accounts[0]!.accountId).toBe(accountId);
    });

    it('should respect isEnabled flag on subsequent sync attempts', async () => {
      // Setup: Connect provider and account
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

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

      // First sync - account enabled
      let syncResponse = await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/sync/trigger',
      });
      expect(syncResponse.body.response.totalAccounts).toBe(1);

      // Disable account
      await helpers.updateAccount({
        id: accountId,
        payload: { isEnabled: false },
        raw: true,
      });

      // Second sync - account disabled
      syncResponse = await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/sync/trigger',
      });
      expect(syncResponse.body.response.totalAccounts).toBe(0);

      // Re-enable account
      await helpers.updateAccount({
        id: accountId,
        payload: { isEnabled: true },
        raw: true,
      });

      // Third sync - account re-enabled
      syncResponse = await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/sync/trigger',
      });
      expect(syncResponse.body.response.totalAccounts).toBe(1);
      expect(syncResponse.body.response.accountResults[0]!.accountId).toBe(accountId);
    });
  });
});
