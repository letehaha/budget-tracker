import { beforeEach, describe, expect, it } from '@jest/globals';
import AccountGroup from '@models/accounts-groups/account-groups.model';
import Accounts from '@models/accounts.model';
import * as helpers from '@tests/helpers';

async function asUser<T>({ cookies, fn }: { cookies: string; fn: () => Promise<T> }): Promise<T> {
  const original = global.APP_AUTH_COOKIES;
  global.APP_AUTH_COOKIES = cookies;
  try {
    return await fn();
  } finally {
    global.APP_AUTH_COOKIES = original;
  }
}

async function createSecondUser(): Promise<string> {
  const signupRes = await helpers.makeAuthRequest({
    method: 'post',
    url: '/auth/sign-up/email',
    payload: {
      email: `user2-${Date.now()}@test.local`,
      password: 'testpassword123',
      name: 'Second User',
    },
  });
  const cookies = helpers.extractCookies(signupRes);
  await asUser({
    cookies,
    fn: () =>
      helpers.makeRequest({
        method: 'post',
        url: '/user/currencies/base',
        payload: { currencyCode: global.BASE_CURRENCY.code },
      }),
  });
  return cookies;
}

describe('Remove account from group', () => {
  let account: Accounts;
  let group: AccountGroup;

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

  it("returns 404 when user B tries to remove accounts from user A's group", async () => {
    await helpers.addAccountToGroup({
      accountId: account.id,
      groupId: group.id,
    });

    const userBCookies = await createSecondUser();

    const res = await asUser({
      cookies: userBCookies,
      fn: () =>
        helpers.removeAccountFromGroup({
          accountIds: [account.id],
          groupId: group.id,
        }),
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when user B tries to remove user A's account from their own group", async () => {
    const userBCookies = await createSecondUser();
    const userBGroup = await asUser({
      cookies: userBCookies,
      fn: () => helpers.createAccountGroup({ name: 'userB-group', raw: true }),
    });

    const res = await asUser({
      cookies: userBCookies,
      fn: () =>
        helpers.removeAccountFromGroup({
          accountIds: [account.id],
          groupId: userBGroup.id,
        }),
    });

    expect(res.statusCode).toBe(404);
  });
});
