import { describe, expect, it } from '@jest/globals';
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

describe('Create account group', () => {
  const groupName = 'Test group';

  it('successfully creates accounts group', async () => {
    await helpers.createAccountGroup({
      name: groupName,
      raw: true,
    });

    const response = await helpers.getAccountGroups({ raw: true });

    expect(response.length).toBe(1);
    expect(!!response.find((i) => i.name === groupName)).toBe(true);
  });

  it('cannot create accounts group with the same name', async () => {
    await helpers.createAccountGroup({
      name: groupName,
      raw: true,
    });
    await helpers.createAccountGroup({
      name: groupName,
    });

    const response = await helpers.getAccountGroups({ raw: true });

    expect(response.length).toBe(2);
  });

  it('successfully creates with parent group of deep nesting with several children', async () => {
    const level1 = await helpers.createAccountGroup({
      name: 'level-1',
      raw: true,
    });

    const level2 = await helpers.createAccountGroup({
      name: 'level-2',
      parentGroupId: level1.id,
      raw: true,
    });

    await helpers.createAccountGroup({
      name: 'level-3-1',
      parentGroupId: level2.id,
    });

    await helpers.createAccountGroup({
      name: 'level-3-2',
      parentGroupId: level2.id,
    });

    const response = await helpers.getAccountGroups({ raw: true });

    expect(response.length).toBe(4);
  });

  it('fails when non-existent parentGroupId provided', async () => {
    const response = await helpers.createAccountGroup({
      name: 'level-1',
      parentGroupId: 99999,
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns 404 when user B creates a group parented under user A's group", async () => {
    const userAGroup = await helpers.createAccountGroup({
      name: 'userA-group',
      raw: true,
    });

    const userBCookies = await createSecondUser();

    const res = await asUser({
      cookies: userBCookies,
      fn: () =>
        helpers.createAccountGroup({
          name: 'userB-group',
          parentGroupId: userAGroup.id,
        }),
    });

    expect(res.statusCode).toBe(404);
  });
});
