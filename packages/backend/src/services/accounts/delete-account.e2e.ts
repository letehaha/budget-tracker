import { beforeEach, describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

describe('Delete Account', () => {
  describe('Account deletion with account groups', () => {
    let account;
    let group;

    beforeEach(async () => {
      account = await helpers.createAccount({ raw: true });
      group = await helpers.createAccountGroup({ name: 'test-group', raw: true });
    });

    it('successfully deletes account that is in an account group', async () => {
      // Add account to group
      await helpers.addAccountToGroup({
        accountId: account.id,
        groupId: group.id,
      });

      // Verify account is in the group
      const groupsBefore = await helpers.getAccountGroups({ raw: true });
      const accountGroup = groupsBefore.find((g) => g.id === group.id);
      expect(accountGroup).toBeDefined();
      expect(accountGroup!.accounts).toContainEqual(
        expect.objectContaining({ id: account.id }),
      );

      // Delete the account
      await helpers.deleteAccount({ id: account.id, raw: true });

      // Verify account is deleted
      const accountsAfterDelete = await helpers.getAccounts();
      const deletedAccount = accountsAfterDelete.find((acc) => acc.id === account.id);
      expect(deletedAccount).toBeUndefined();

      // Verify the group still exists but account is removed from it
      const groupsAfter = await helpers.getAccountGroups({ raw: true });
      const accountGroupAfter = groupsAfter.find((g) => g.id === group.id);
      expect(accountGroupAfter).toBeDefined();
      expect(accountGroupAfter!.accounts).not.toContainEqual(
        expect.objectContaining({ id: account.id }),
      );
    });

    it('successfully deletes account from multiple groups', async () => {
      // Create fresh account and groups for this test
      const testAccount = await helpers.createAccount({ raw: true });
      const testGroup1 = await helpers.createAccountGroup({ name: 'test-group-1-fresh', raw: true });
      const testGroup2 = await helpers.createAccountGroup({ name: 'test-group-2-fresh', raw: true });

      // Add account to both groups
      const addResult1 = await helpers.addAccountToGroup({
        accountId: testAccount.id,
        groupId: testGroup1.id,
      });
      expect(addResult1.statusCode).toBe(200);

      const addResult2 = await helpers.addAccountToGroup({
        accountId: testAccount.id,
        groupId: testGroup2.id,
      });
      expect(addResult2.statusCode).toBe(200);

      // Delete the account - should succeed due to CASCADE deletion on AccountGroupings
      await helpers.deleteAccount({ id: testAccount.id, raw: true });

      // Verify account is deleted
      const accountsAfterDelete = await helpers.getAccounts();
      const deletedAccount = accountsAfterDelete.find((acc) => acc.id === testAccount.id);
      expect(deletedAccount).toBeUndefined();

      // Verify both groups still exist (they should not be deleted)
      const groupsAfter = await helpers.getAccountGroups({ raw: true });
      const accountGroup1After = groupsAfter.find((g) => g.id === testGroup1.id);
      const accountGroup2After = groupsAfter.find((g) => g.id === testGroup2.id);
      expect(accountGroup1After).toBeDefined();
      expect(accountGroup2After).toBeDefined();
    });
  });

  describe('Account deletion with transactions', () => {
    let account;

    beforeEach(async () => {
      account = await helpers.createAccount({ raw: true });
    });

    it('successfully deletes account with transactions', async () => {
      // Create some transactions for the account
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100 }),
        raw: true,
      });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 200 }),
        raw: true,
      });

      // Verify transactions exist
      const transactionsBefore = await helpers.getTransactions({ raw: true });
      const accountTransactions = transactionsBefore.filter((tx) => tx.accountId === account.id);
      expect(accountTransactions).toHaveLength(2);

      // Delete the account
      await helpers.deleteAccount({ id: account.id, raw: true });

      // Verify account is deleted
      const accountsAfterDelete = await helpers.getAccounts();
      const deletedAccount = accountsAfterDelete.find((acc) => acc.id === account.id);
      expect(deletedAccount).toBeUndefined();

      // Verify all transactions are deleted (cascade)
      const transactionsAfterDelete = await helpers.getTransactions({ raw: true });
      const remainingAccountTransactions = transactionsAfterDelete.filter(
        (tx) => tx.accountId === account.id,
      );
      expect(remainingAccountTransactions).toHaveLength(0);
    });
  });

  describe('Account deletion with both groups and transactions', () => {
    let account;
    let group;

    beforeEach(async () => {
      account = await helpers.createAccount({ raw: true });
      group = await helpers.createAccountGroup({ name: 'test-group', raw: true });
    });

    it('successfully deletes account with both transactions and group membership', async () => {
      // Add account to group
      await helpers.addAccountToGroup({
        accountId: account.id,
        groupId: group.id,
      });

      // Create transactions
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100 }),
        raw: true,
      });

      // Verify setup
      const transactionsBefore = await helpers.getTransactions({ raw: true });
      const accountTransactions = transactionsBefore.filter((tx) => tx.accountId === account.id);
      expect(accountTransactions).toHaveLength(1);

      const groupsBefore = await helpers.getAccountGroups({ raw: true });
      const accountGroup = groupsBefore.find((g) => g.id === group.id);
      expect(accountGroup).toBeDefined();
      expect(accountGroup!.accounts).toContainEqual(
        expect.objectContaining({ id: account.id }),
      );

      // Delete the account
      await helpers.deleteAccount({ id: account.id, raw: true });

      // Verify account is deleted
      const accountsAfterDelete = await helpers.getAccounts();
      const deletedAccount = accountsAfterDelete.find((acc) => acc.id === account.id);
      expect(deletedAccount).toBeUndefined();

      // Verify transactions are deleted
      const transactionsAfterDelete = await helpers.getTransactions({ raw: true });
      const remainingAccountTransactions = transactionsAfterDelete.filter(
        (tx) => tx.accountId === account.id,
      );
      expect(remainingAccountTransactions).toHaveLength(0);

      // Verify group still exists but account is removed
      const groupsAfter = await helpers.getAccountGroups({ raw: true });
      const accountGroupAfter = groupsAfter.find((g) => g.id === group.id);
      expect(accountGroupAfter).toBeDefined();
      expect(accountGroupAfter!.accounts).not.toContainEqual(
        expect.objectContaining({ id: account.id }),
      );
    });
  });
});
