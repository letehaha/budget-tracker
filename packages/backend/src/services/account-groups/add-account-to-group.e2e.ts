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

describe('Add account to group', () => {
  let account: Accounts;
  let group: AccountGroup;

  beforeEach(async () => {
    account = await helpers.createAccount({ raw: true });
    group = await helpers.createAccountGroup({ name: 'test', raw: true });
  });

  it('successfully adds account to group', async () => {
    const result = await helpers.addAccountToGroup({
      accountId: account.id,
      groupId: group.id,
    });

    expect(result.statusCode).toBe(200);
  });

  it('successfully adds account to group_1 -> group_2 -> group_1', async () => {
    const group_2 = await helpers.createAccountGroup({
      name: 'test-1',
      raw: true,
    });
    await helpers.addAccountToGroup({
      accountId: account.id,
      groupId: group.id,
    });
    await helpers.addAccountToGroup({
      accountId: account.id,
      groupId: group_2.id,
    });
    const result = await helpers.addAccountToGroup({
      accountId: account.id,
      groupId: group.id,
    });

    expect(result.statusCode).toBe(200);
  });

  it('fails when account does not exist', async () => {
    const result = await helpers.addAccountToGroup({
      accountId: 9999,
      groupId: group.id,
    });

    expect(result.statusCode).toBe(404);
  });

  it('fails when group does not exist', async () => {
    const result = await helpers.addAccountToGroup({
      accountId: account.id,
      groupId: 9999,
    });

    expect(result.statusCode).toBe(404);
  });

  it("returns 404 when user B tries to add user A's account to their own group", async () => {
    const userBCookies = await createSecondUser();
    const userBGroup = await asUser({
      cookies: userBCookies,
      fn: () => helpers.createAccountGroup({ name: 'userB-group', raw: true }),
    });

    const res = await asUser({
      cookies: userBCookies,
      fn: () =>
        helpers.addAccountToGroup({
          accountId: account.id,
          groupId: userBGroup.id,
        }),
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when user B tries to add their own account to user A's group", async () => {
    const userBCookies = await createSecondUser();
    const userBAccount = await asUser({
      cookies: userBCookies,
      fn: () => helpers.createAccount({ raw: true }),
    });

    const res = await asUser({
      cookies: userBCookies,
      fn: () =>
        helpers.addAccountToGroup({
          accountId: userBAccount.id,
          groupId: group.id,
        }),
    });

    expect(res.statusCode).toBe(404);
  });
});
