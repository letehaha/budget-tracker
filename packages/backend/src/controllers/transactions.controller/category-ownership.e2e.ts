import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
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
      email: `user2-${Date.now()}-${Math.random()}@test.local`,
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

describe('Transaction categoryId ownership validation', () => {
  describe('create', () => {
    it('rejects a non-existent categoryId with 404', async () => {
      const account = await helpers.createAccount({ raw: true });

      const res = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({ accountId: account.id }),
          categoryId: 999999,
        },
      });

      expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it("returns 404 when user B creates a transaction with user A's categoryId (IDOR)", async () => {
      const userACategory = await helpers.addCustomCategory({
        name: 'userA-only-category',
        color: '#FF0000',
        raw: true,
      });

      const userBCookies = await createSecondUser();

      const res = await asUser({
        cookies: userBCookies,
        fn: async () => {
          const account = await helpers.createAccount({ raw: true });
          return helpers.createTransaction({
            payload: {
              ...helpers.buildTransactionPayload({ accountId: account.id }),
              categoryId: userACategory.id,
            },
          });
        },
      });

      expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('accepts a categoryId owned by the same user', async () => {
      const account = await helpers.createAccount({ raw: true });
      const ownCategory = await helpers.addCustomCategory({
        name: 'own-category',
        color: '#00FF00',
        raw: true,
      });

      const [tx] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({ accountId: account.id }),
          categoryId: ownCategory.id,
        },
        raw: true,
      });

      expect(tx.categoryId).toBe(ownCategory.id);
    });
  });

  describe('update', () => {
    it('rejects a non-existent categoryId with 404', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });

      const res = await helpers.updateTransaction({
        id: tx.id,
        payload: { categoryId: 999999 },
      });

      expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it("returns 404 when user B updates own transaction with user A's categoryId (IDOR)", async () => {
      const userACategory = await helpers.addCustomCategory({
        name: 'userA-only-category',
        color: '#FF0000',
        raw: true,
      });

      const userBCookies = await createSecondUser();

      const res = await asUser({
        cookies: userBCookies,
        fn: async () => {
          const account = await helpers.createAccount({ raw: true });
          const userBCategories = await helpers.getCategoriesList();
          const [tx] = await helpers.createTransaction({
            payload: {
              ...helpers.buildTransactionPayload({ accountId: account.id }),
              categoryId: userBCategories[0]!.id,
            },
            raw: true,
          });
          return helpers.updateTransaction({
            id: tx.id,
            payload: { categoryId: userACategory.id },
          });
        },
      });

      expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('accepts a categoryId owned by the same user', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });
      const ownCategory = await helpers.addCustomCategory({
        name: 'own-category',
        color: '#00FF00',
        raw: true,
      });

      const [updated] = await helpers.updateTransaction({
        id: tx.id,
        payload: { categoryId: ownCategory.id },
        raw: true,
      });

      expect(updated.categoryId).toBe(ownCategory.id);
    });
  });
});
