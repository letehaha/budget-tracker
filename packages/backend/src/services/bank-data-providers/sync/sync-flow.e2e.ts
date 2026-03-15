import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';
import { redisClient } from '@root/redis-client';
import * as helpers from '@tests/helpers';
import { VALID_MONOBANK_TOKEN } from '@tests/mocks/monobank/mock-api';

import { REDIS_KEYS, SyncStatus } from './sync-status-tracker';

describe('Sync Flow E2E', () => {
  describe('Sync Status Tracking', () => {
    it('should return empty status when no accounts are connected', async () => {
      const response = await helpers.makeRequest({
        method: 'get',
        url: '/bank-data-providers/sync/status',
      });

      expect(response.status).toBe(200);
      expect(response.body.response).toBeDefined();
      expect(response.body.response.lastSyncAt).toBeNull();
      expect(response.body.response.accounts).toEqual([]);
      expect(response.body.response.summary.total).toBe(0);
    });

    it('should return status for connected accounts. [just now] connected account should be marked as "syncing"', async () => {
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

      await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: [externalAccounts[0]!.externalId],
        raw: true,
      });

      // Test: Get status
      const response = await helpers.makeRequest({
        method: 'get',
        url: '/bank-data-providers/sync/status',
      });

      expect(response.status).toBe(200);
      expect(response.body.response.accounts.length).toBe(1);
      expect(response.body.response.summary.total).toBe(1);

      const accountStatus = response.body.response.accounts[0]!;
      expect(accountStatus).toHaveProperty('accountId');
      expect(accountStatus).toHaveProperty('accountName');
      expect(accountStatus).toHaveProperty('providerType');
      expect(accountStatus).toHaveProperty('status');
      // Newly connected account has auto-sync functionality so at the moment of
      // connection it's expected for it to be "syncing" or "queued"
      expect([SyncStatus.SYNCING, SyncStatus.QUEUED].includes(accountStatus.status)).toBe(true);
    });
  });

  describe('Auto Sync Check', () => {
    it('should trigger sync when no previous sync exists', async () => {
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

      // Mock transaction data
      const mockTransactions = helpers.monobank.mockedTransactionData(3);
      const { getMonobankTransactionsMock } = await import('@tests/mocks/monobank/mock-api');
      global.mswMockServer.use(getMonobankTransactionsMock({ response: mockTransactions }));

      await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: [externalAccounts[0]!.externalId],
        raw: true,
      });

      // Clear any sync that happened during account connection
      await redisClient.del(REDIS_KEYS.userLastAutoSync(global.userId));

      // Test: Check sync should trigger
      const response = await helpers.makeRequest({
        method: 'get',
        url: '/bank-data-providers/sync/check',
      });

      expect(response.status).toBe(200);
      expect(response.body.response.syncTriggered).toBe(true);
      expect(response.body.response).toHaveProperty('totalAccounts');
      expect(response.body.response.totalAccounts).toBeGreaterThan(0);
    });

    it.skip('should not trigger sync when last sync was within 4 hours', async () => {
      // TODO: This test is flaky because auto-sync from account connection
      // can update the lastSyncAt timestamp after we set it manually
      // Need to refactor to avoid race condition
    });

    it('should trigger sync when last sync was more than 4 hours ago', async () => {
      // Setup: Connect account
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
        accountExternalIds: [externalAccounts[0]!.externalId],
        raw: true,
      });

      // Set last sync to 5 hours ago
      const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
      await redisClient.set(REDIS_KEYS.userLastAutoSync(global.userId), fiveHoursAgo.toString());

      // Test: Check sync should trigger
      const response = await helpers.makeRequest({
        method: 'get',
        url: '/bank-data-providers/sync/check',
      });

      expect(response.status).toBe(200);
      expect(response.body.response.syncTriggered).toBe(true);
    });
  });

  describe('Manual Sync Trigger', () => {
    it('should sync all connected accounts', async () => {
      // Setup: Connect multiple accounts
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      // Mock transactions
      const mockTransactions = helpers.monobank.mockedTransactionData(5);
      const { getMonobankTransactionsMock } = await import('@tests/mocks/monobank/mock-api');
      global.mswMockServer.use(getMonobankTransactionsMock({ response: mockTransactions }));

      // Connect first 2 accounts
      await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: externalAccounts.slice(0, 2).map((a: { externalId: string }) => a.externalId),
        raw: true,
      });

      // Test: Trigger sync
      const response = await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/sync/trigger',
      });

      expect(response.status).toBe(200);
      expect(response.body.response).toHaveProperty('totalAccounts');
      expect(response.body.response).toHaveProperty('syncedAccounts');
      expect(response.body.response).toHaveProperty('failedAccounts');
      expect(response.body.response).toHaveProperty('accountResults');

      expect(response.body.response.totalAccounts).toBe(2);
      expect(Array.isArray(response.body.response.accountResults)).toBe(true);
      expect(response.body.response.accountResults.length).toBe(2);

      // Verify each account result
      response.body.response.accountResults.forEach(
        (result: { accountId: number; accountName: string; status: string }) => {
          expect(result).toHaveProperty('accountId');
          expect(result).toHaveProperty('accountName');
          expect(result).toHaveProperty('status');
          expect(['success', 'failed', 'skipped']).toContain(result.status);
        },
      );

      // Manual trigger doesn't update last auto-sync timestamp
      // Only /check endpoint updates it when auto-sync is triggered
      // So we just verify the sync was triggered successfully
      expect(response.body.response.totalAccounts).toBeGreaterThan(0);
    });

    it('should handle sync when no accounts are connected', async () => {
      const response = await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/sync/trigger',
      });

      expect(response.status).toBe(200);
      expect(response.body.response.totalAccounts).toBe(0);
      expect(response.body.response.syncedAccounts).toBe(0);
      expect(response.body.response.accountResults).toEqual([]);
    });

    it('should skip disabled accounts from sync', async () => {
      // Setup: Connect provider and multiple accounts
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
        accountExternalIds: externalAccounts.slice(0, 2).map((a: { externalId: string }) => a.externalId),
        raw: true,
      });

      // Disable the first account
      await helpers.updateAccount({
        id: syncedAccounts[0]!.id,
        payload: { isEnabled: false },
        raw: true,
      });

      // Trigger sync
      const response = await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/sync/trigger',
      });

      expect(response.status).toBe(200);
      // Only 1 account should be synced (the enabled one)
      expect(response.body.response.totalAccounts).toBe(1);
      expect(response.body.response.accountResults.length).toBe(1);
      expect(response.body.response.accountResults[0]!.accountId).toBe(syncedAccounts[1]!.id);
    });

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

      // Verify sync skips disabled account
      let response = await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/sync/trigger',
      });
      expect(response.body.response.totalAccounts).toBe(0);

      // Re-enable the account
      await helpers.updateAccount({
        id: accountId,
        payload: { isEnabled: true },
        raw: true,
      });

      // Verify sync now includes the account
      response = await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/sync/trigger',
      });
      expect(response.body.response.totalAccounts).toBe(1);
      expect(response.body.response.accountResults[0]!.accountId).toBe(accountId);
    });
  });

  // TODO: unskip and fix
  describe.skip('Sync Status Updates', () => {
    it('should update Redis status during sync lifecycle', async () => {
      // Setup
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

      // Wait for auto-sync to complete
      await helpers.sleep(2000);

      // Trigger sync and check status updates
      await helpers.makeRequest({
        method: 'post',
        url: '/bank-data-providers/sync/trigger',
      });

      // Give it a tiny moment for the sync to be queued
      await helpers.sleep(50);

      // Status should be updated (Monobank goes to QUEUED first)
      const updatedStatus = await redisClient.get(REDIS_KEYS.accountSyncStatus(accountId));
      expect(updatedStatus).not.toBeNull();

      const parsed = JSON.parse(updatedStatus!);
      expect(parsed).toHaveProperty('accountId');
      expect(parsed).toHaveProperty('status');
      expect(parsed.accountId).toBe(accountId);
      // Monobank should be QUEUED or already COMPLETED (fast worker) or still COMPLETED from auto-sync
      expect(['queued', 'completed']).toContain(parsed.status);
    });

    it('should transition Monobank accounts from QUEUED to SYNCING to COMPLETED', async () => {
      const connectionResult = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId: connectionResult.connectionId,
        raw: true,
      });

      // Mock transaction data
      const mockTransactions = helpers.monobank.mockedTransactionData(3);
      const { getMonobankTransactionsMock } = await import('@tests/mocks/monobank/mock-api');
      global.mswMockServer.use(getMonobankTransactionsMock({ response: mockTransactions }));

      const { syncedAccounts } = await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId: connectionResult.connectionId,
        accountExternalIds: [externalAccounts[0]!.externalId],
        raw: true,
      });

      const accountId = syncedAccounts[0]!.id;

      // Clear initial sync status
      const statusKey = REDIS_KEYS.accountSyncStatus(accountId);
      await redisClient.del(statusKey);

      // Trigger sync manually
      const { jobGroupId } = await helpers.bankDataProviders.syncTransactionsForAccount({
        connectionId: connectionResult.connectionId,
        accountId,
        raw: true,
      });

      // Check status immediately - should be QUEUED
      await helpers.sleep(50);
      const queuedStatus = await redisClient.get(statusKey);
      if (queuedStatus) {
        const parsed = JSON.parse(queuedStatus);
        expect(parsed.status).toBe('queued');
      }

      // Wait for job to complete
      await helpers.bankDataProviders.waitForSyncJobsToComplete({
        connectionId: connectionResult.connectionId,
        jobGroupId: jobGroupId!,
        timeoutMs: 10000,
      });

      // Check final status - should be COMPLETED
      await helpers.sleep(5_000);
      const completedStatus = await redisClient.get(statusKey);
      expect(completedStatus).not.toBeNull();

      const parsed = JSON.parse(completedStatus!);
      expect(parsed.status).toBe('completed');
      expect(parsed.completedAt).not.toBeNull();
    });
  });
});
