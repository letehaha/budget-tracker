import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import * as helpers from '@tests/helpers';
import { VALID_MONOBANK_TOKEN } from '@tests/mocks/monobank/mock-api';

/**
 * Helper to create a monobank connection with one linked account.
 * Returns connectionId and the auto-created account group.
 */
async function createConnectionWithAccount({ providerName }: { providerName: string }) {
  const { connectionId } = await helpers.bankDataProviders.connectProvider({
    providerType: BANK_PROVIDER_TYPE.MONOBANK,
    credentials: { apiToken: VALID_MONOBANK_TOKEN },
    providerName,
    raw: true,
  });

  const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
    connectionId,
    raw: true,
  });

  await helpers.bankDataProviders.connectSelectedAccounts({
    connectionId,
    accountExternalIds: [externalAccounts[0]!.externalId],
    raw: true,
  });

  const groups = await helpers.getAccountGroups({ raw: true });
  const group = groups.find((g) => g.bankDataProviderConnectionId === connectionId);

  return { connectionId, group: group!, externalAccounts };
}

/**
 * E2E tests for bank connection ↔ account group lifecycle.
 *
 * Covers: auto-creation, name sync, deletion blocking,
 * cleanup on disconnect, and account grouping on link.
 */
describe('Bank connection account group lifecycle', () => {
  describe('Auto-creation of account group', () => {
    it('should auto-create an account group when connecting bank accounts', async () => {
      const { group, connectionId } = await createConnectionWithAccount({ providerName: 'My Bank' });

      expect(group).toBeDefined();
      expect(group.name).toBe('My Bank');
      expect(group.bankDataProviderConnectionId).toBe(connectionId);
      expect(group.accounts!.length).toBeGreaterThan(0);
    });

    it('should reuse existing group when connecting additional accounts', async () => {
      const { connectionId, externalAccounts } = await createConnectionWithAccount({ providerName: 'Reuse Test' });

      // Connect a second account to the same connection
      if (externalAccounts.length > 1) {
        await helpers.bankDataProviders.connectSelectedAccounts({
          connectionId,
          accountExternalIds: [externalAccounts[1]!.externalId],
          raw: true,
        });
      }

      // Verify only one group exists for this connection
      const groups = await helpers.getAccountGroups({ raw: true });
      const connectionGroups = groups.filter((g) => g.bankDataProviderConnectionId === connectionId);

      expect(connectionGroups.length).toBe(1);
    });

    it('should not add account to connection group if already in a user-created group', async () => {
      // 1. Create a connection (no accounts yet)
      const { connectionId } = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        providerName: 'Skip Grouped',
        raw: true,
      });

      // 2. Create a user group and add a manual account to it
      const userGroup = await helpers.createAccountGroup({ name: 'User Group', raw: true });
      const manualAccount = await helpers.createAccount({ raw: true });
      await helpers.addAccountToGroup({
        accountId: manualAccount.id,
        groupId: userGroup.id,
        raw: true,
      });

      // 3. Connect bank accounts
      const { accounts: externalAccounts } = await helpers.bankDataProviders.listExternalAccounts({
        connectionId,
        raw: true,
      });
      await helpers.bankDataProviders.connectSelectedAccounts({
        connectionId,
        accountExternalIds: [externalAccounts[0]!.externalId],
        raw: true,
      });

      // 4. Verify the manual account is still in the user group, not moved to connection group
      const groups = await helpers.getAccountGroups({ raw: true });
      const userGroupAfter = groups.find((g) => g.id === userGroup.id);

      expect(userGroupAfter).toBeDefined();
      expect(userGroupAfter!.accounts!.some((a) => a.id === manualAccount.id)).toBe(true);
    });
  });

  describe('Blocking deletion of connection-linked groups', () => {
    it('should reject deletion of a connection-linked account group', async () => {
      const { group } = await createConnectionWithAccount({ providerName: 'No Delete' });

      const result = await helpers.deleteAccountGroup({ groupId: group.id, raw: false });

      expect(result.statusCode).not.toBe(200);
    });

    it('should keep the group intact after failed deletion attempt', async () => {
      const { group, connectionId } = await createConnectionWithAccount({ providerName: 'Still Here' });

      await helpers.deleteAccountGroup({ groupId: group.id, raw: false });

      const groups = await helpers.getAccountGroups({ raw: true });
      const stillExists = groups.find((g) => g.bankDataProviderConnectionId === connectionId);

      expect(stillExists).toBeDefined();
      expect(stillExists!.id).toBe(group.id);
    });
  });

  describe('Cleanup on disconnect', () => {
    it('should delete connection group when provider is disconnected (preserve accounts)', async () => {
      const { connectionId, group } = await createConnectionWithAccount({ providerName: 'Disconnect Test' });

      await helpers.bankDataProviders.disconnectProvider({
        connectionId,
        removeAssociatedAccounts: false,
        raw: true,
      });

      const groups = await helpers.getAccountGroups({ raw: true });
      const deletedGroup = groups.find((g) => g.id === group.id);

      expect(deletedGroup).toBeUndefined();
    });

    it('should delete connection group when provider is disconnected (remove accounts)', async () => {
      const { connectionId, group } = await createConnectionWithAccount({ providerName: 'Remove All Test' });

      await helpers.bankDataProviders.disconnectProvider({
        connectionId,
        removeAssociatedAccounts: true,
        raw: true,
      });

      const groups = await helpers.getAccountGroups({ raw: true });
      const deletedGroup = groups.find((g) => g.id === group.id);

      expect(deletedGroup).toBeUndefined();
    });
  });

  describe('Name sync on connection rename', () => {
    it('should sync account group name when connection name changes', async () => {
      const { connectionId } = await createConnectionWithAccount({ providerName: 'Original Name' });

      await helpers.bankDataProviders.updateConnectionDetails({
        connectionId,
        providerName: 'Renamed Connection',
        raw: true,
      });

      const groups = await helpers.getAccountGroups({ raw: true });
      const updatedGroup = groups.find((g) => g.bankDataProviderConnectionId === connectionId);

      expect(updatedGroup).toBeDefined();
      expect(updatedGroup!.name).toBe('Renamed Connection');
    });

    it('should NOT sync account group name when user has manually renamed the group', async () => {
      const { connectionId, group } = await createConnectionWithAccount({ providerName: 'Bank Connection' });

      await helpers.updateAccountGroup({
        groupId: group.id,
        name: 'My Custom Name',
        raw: true,
      });

      await helpers.bankDataProviders.updateConnectionDetails({
        connectionId,
        providerName: 'New Connection Name',
        raw: true,
      });

      const groups = await helpers.getAccountGroups({ raw: true });
      const unchangedGroup = groups.find((g) => g.bankDataProviderConnectionId === connectionId);

      expect(unchangedGroup).toBeDefined();
      expect(unchangedGroup!.name).toBe('My Custom Name');
    });

    it('should handle connection without an account group gracefully', async () => {
      const { connectionId } = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        providerName: 'No Accounts Connection',
        raw: true,
      });

      const result = await helpers.bankDataProviders.updateConnectionDetails({
        connectionId,
        providerName: 'Updated Name',
        raw: true,
      });

      expect(result.connection.providerName).toBe('Updated Name');
    });
  });
});
