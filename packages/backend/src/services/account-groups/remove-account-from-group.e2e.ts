import { beforeEach, describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

describe('Remove account from group', () => {
  let account, group;

  beforeEach(async () => {
    account = await helpers.createAccount({ raw: true });
    group = await helpers.createAccountGroup({ name: 'test', raw: true });
  });

  it('successfully removes account from group', async () => {
    await helpers.addAccountToGroup({
      accountId: account.id,
      groupId: group.id,
    });

    const result = await helpers.removeAccountFromGroup({
      accountIds: [account.id],
      groupId: group.id,
    });

    expect(result.statusCode).toBe(200);
  });

  it('successfully removes multiple accounts from group', async () => {
    const accountB = await helpers.createAccount({ raw: true });
    await helpers.addAccountToGroup({
      accountId: account.id,
      groupId: group.id,
    });
    await helpers.addAccountToGroup({
      accountId: accountB.id,
      groupId: group.id,
    });

    const result = await helpers.removeAccountFromGroup({
      accountIds: [account.id, accountB.id],
      groupId: group.id,
    });

    expect(result.statusCode).toBe(200);
  });

  it('successfully removes only one account from multiple connected ones', async () => {
    const accountB = await helpers.createAccount({ raw: true });
    await helpers.addAccountToGroup({
      accountId: account.id,
      groupId: group.id,
    });
    await helpers.addAccountToGroup({
      accountId: accountB.id,
      groupId: group.id,
    });

    const result = await helpers.removeAccountFromGroup({
      accountIds: [account.id],
      groupId: group.id,
    });

    expect(result.statusCode).toBe(200);
  });

  it('fails when trying to remove non-existing account', async () => {
    const result = await helpers.removeAccountFromGroup({
      accountIds: [9999],
      groupId: group.id,
    });

    expect(result.statusCode).toBe(404);
  });

  it('does not fail when trying to remove non-existing match', async () => {
    await helpers.addAccountToGroup({
      accountId: account.id,
      groupId: group.id,
    });

    await helpers.removeAccountFromGroup({
      accountIds: [account.id],
      groupId: group.id,
    });

    const result = await helpers.removeAccountFromGroup({
      accountIds: [account.id],
      groupId: group.id,
    });

    expect(result.statusCode).toBe(200);
  });
});
