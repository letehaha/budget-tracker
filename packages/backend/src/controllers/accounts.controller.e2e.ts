import { ACCOUNT_TYPES, API_ERROR_CODES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { addDays } from 'date-fns';

const DEFAULT_TX_AMOUNT = 1000;

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
  return helpers.extractCookies(signupRes);
}

async function asUser<T>({ cookies, fn }: { cookies: string; fn: () => Promise<T> }): Promise<T> {
  const original = global.APP_AUTH_COOKIES;
  global.APP_AUTH_COOKIES = cookies;
  try {
    return await fn();
  } finally {
    global.APP_AUTH_COOKIES = original;
  }
}

async function createExpenseTransactions({ accountId, count }: { accountId: number; count: number }) {
  for (const index in Array(count).fill(0)) {
    await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({ accountId, amount: DEFAULT_TX_AMOUNT }),
        time: addDays(new Date(), +index + 1).toISOString(),
      },
    });
  }
}

describe('Accounts controller', () => {
  describe('create account', () => {
    const initialBalance = 1000;
    const creditLimit = 500;

    it('should correctly create account with correct balance for default currency', async () => {
      const account = await helpers.createAccount({
        payload: {
          ...helpers.buildAccountPayload(),
          initialBalance,
          creditLimit,
        },
        raw: true,
      });

      expect(account.initialBalance).toStrictEqual(initialBalance);
      expect(account.refInitialBalance).toStrictEqual(initialBalance);
      expect(account.currentBalance).toStrictEqual(initialBalance);
      expect(account.refCurrentBalance).toStrictEqual(initialBalance);
      expect(account.creditLimit).toStrictEqual(creditLimit);
      expect(account.refCreditLimit).toStrictEqual(creditLimit);
    });
    it('should correctly create account with correct balance for external currency', async () => {
      const currency = (await helpers.addUserCurrencies({ currencyCodes: ['UAH'], raw: true })).currencies[0]!;

      const account = await helpers.createAccount({
        payload: {
          ...helpers.buildAccountPayload(),
          initialBalance,
          creditLimit,
          currencyCode: currency.currencyCode,
        },
        raw: true,
      });

      const currencyRate = (await helpers.getCurrenciesRates({ codes: ['UAH'] }))[0];

      expect(account.initialBalance).toStrictEqual(initialBalance);
      expect(account.refInitialBalance).toEqualRefValue(initialBalance * currencyRate!.rate);
      expect(account.currentBalance).toStrictEqual(initialBalance);
      expect(account.refCurrentBalance).toEqualRefValue(initialBalance * currencyRate!.rate);
      expect(account.creditLimit).toStrictEqual(creditLimit);
      expect(account.refCreditLimit).toEqualRefValue(creditLimit * currencyRate!.rate);
    });

    it('rejects negative creditLimit on creation', async () => {
      const res = await helpers.createAccount({
        payload: {
          ...helpers.buildAccountPayload(),
          creditLimit: -100,
        },
        raw: false,
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
  describe('update account', () => {
    it('should return 404 if try to update unexisting account', async () => {
      const res = await helpers.updateAccount<helpers.ErrorResponse>({
        id: 1,
      });

      expect(res.statusCode).toEqual(ERROR_CODES.NotFoundError);
      expect(helpers.extractResponse(res).code).toEqual(API_ERROR_CODES.notFound);
    });

    it('should just ignore if no data passed', async () => {
      const account = await helpers.createAccount({ raw: true });
      const updatedAccount = await helpers.updateAccount({
        id: account.id,
        payload: {},
        raw: true,
      });

      expect(account).toStrictEqual(updatedAccount);
    });

    it('updates account correctly with default user currency', async () => {
      const newBasicFieldsValues = {
        name: 'new test',
      };
      const account = await helpers.createAccount({ raw: true });
      const updatedAccount = await helpers.updateAccount({
        id: account.id,
        payload: newBasicFieldsValues,
        raw: true,
      });

      expect(updatedAccount).toStrictEqual({
        ...account,
        ...newBasicFieldsValues,
      });

      await createExpenseTransactions({ accountId: account.id, count: 3 });

      const accountAfterTxs = await helpers.getAccount({
        id: account.id,
        raw: true,
      });
      expect(accountAfterTxs.initialBalance).toBe(0);
      expect(accountAfterTxs.refInitialBalance).toBe(0);
      expect(accountAfterTxs.currentBalance).toBe(-3000);
      expect(accountAfterTxs.refCurrentBalance).toBe(-3000);

      // Update account balance directly, with no tx usage. In that case balance should
      // be changed as well as initialBalance
      const accountUpdateBalance = await helpers.updateAccount({
        id: account.id,
        payload: {
          currentBalance: -500,
        },
        raw: true,
      });

      // We changed currentBalance from -3000 to -500, so it means that
      // initialbalance should be increased on 2500
      expect(accountUpdateBalance.initialBalance).toBe(2500);
      expect(accountUpdateBalance.refInitialBalance).toBe(2500);
      expect(accountUpdateBalance.currentBalance).toBe(-500);
      expect(accountUpdateBalance.refCurrentBalance).toBe(-500);
    });
    it('updates account correctly with non-default user currency', async () => {
      const newCurrency = 'UAH';
      const currency = (
        await helpers.addUserCurrencies({
          currencyCodes: [newCurrency],
          raw: true,
        })
      ).currencies[0];
      const account = await helpers.createAccount({
        payload: {
          ...helpers.buildAccountPayload(),
          currencyCode: currency!.currencyCode,
        },
        raw: true,
      });

      await createExpenseTransactions({ accountId: account.id, count: 3 });

      const accountAfterTxs = await helpers.getAccount({
        id: account.id,
        raw: true,
      });
      const currencyRate = (await helpers.getCurrenciesRates({ codes: [newCurrency] }))[0]!.rate;
      expect(accountAfterTxs.initialBalance).toBe(0);
      expect(accountAfterTxs.refInitialBalance).toBe(0);
      expect(accountAfterTxs.currentBalance).toBe(-3000);
      expect(accountAfterTxs.refCurrentBalance).toEqualRefValue(-3000 * currencyRate);

      // Update account balance directly, with no tx usage. In that case balance should
      // be changed as well as initialBalance
      const accountUpdateBalance = await helpers.updateAccount({
        id: account.id,
        payload: {
          currentBalance: -500,
        },
        raw: true,
      });

      // We changed currentBalance from -3000 to -500, so it means that
      // initialbalance should be increased on 2500
      expect(accountUpdateBalance.initialBalance).toBe(2500);
      expect(accountUpdateBalance.refInitialBalance).toEqualRefValue(2500 * currencyRate);
      expect(accountUpdateBalance.currentBalance).toBe(-500);
      expect(accountUpdateBalance.refCurrentBalance).toEqualRefValue(-500 * currencyRate);
    });

    it('rejects negative creditLimit', async () => {
      const account = await helpers.createAccount({ raw: true });
      const res = await helpers.updateAccount({
        id: account.id,
        payload: { creditLimit: -100 },
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('does not change balances when creditLimit changes', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          initialBalance: 1000,
          creditLimit: 500,
        }),
        raw: true,
      });

      const updated = await helpers.updateAccount({
        id: account.id,
        payload: { creditLimit: 800 },
        raw: true,
      });

      // Credit limit is separate from balance — only creditLimit and
      // refCreditLimit change, all balance fields stay untouched
      expect(updated.creditLimit).toBe(800);
      expect(updated.currentBalance).toBe(account.currentBalance);
      expect(updated.refCurrentBalance).toBe(account.refCurrentBalance);
      expect(updated.initialBalance).toBe(account.initialBalance);
      expect(updated.refInitialBalance).toBe(account.refInitialBalance);
    });

    it('does not change balances when creditLimit is set to zero', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          initialBalance: 1000,
          creditLimit: 500,
        }),
        raw: true,
      });

      const updated = await helpers.updateAccount({
        id: account.id,
        payload: { creditLimit: 0 },
        raw: true,
      });

      expect(updated.creditLimit).toBe(0);
      expect(updated.refCreditLimit).toBe(0);
      expect(updated.currentBalance).toBe(account.currentBalance);
      expect(updated.refCurrentBalance).toBe(account.refCurrentBalance);
      expect(updated.initialBalance).toBe(account.initialBalance);
      expect(updated.refInitialBalance).toBe(account.refInitialBalance);
    });

    it('does not change balances when creditLimit changes with existing transactions', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          initialBalance: 1000,
          creditLimit: 500,
        }),
        raw: true,
      });

      await createExpenseTransactions({ accountId: account.id, count: 3 });

      const afterTxs = await helpers.getAccount({ id: account.id, raw: true });
      expect(afterTxs.currentBalance).toBe(-2000);

      const updated = await helpers.updateAccount({
        id: afterTxs.id,
        payload: { creditLimit: 1000 },
        raw: true,
      });

      // Balances unchanged — only creditLimit updated
      expect(updated.creditLimit).toBe(1000);
      expect(updated.currentBalance).toBe(afterTxs.currentBalance);
      expect(updated.refCurrentBalance).toBe(afterTxs.refCurrentBalance);
      expect(updated.initialBalance).toBe(afterTxs.initialBalance);
      expect(updated.refInitialBalance).toBe(afterTxs.refInitialBalance);
    });

    it('recalculates refCreditLimit for non-base currency', async () => {
      const newCurrency = 'UAH';
      const currency = (await helpers.addUserCurrencies({ currencyCodes: [newCurrency], raw: true })).currencies[0]!;

      const account = await helpers.createAccount({
        payload: {
          ...helpers.buildAccountPayload(),
          initialBalance: 1000,
          creditLimit: 500,
          currencyCode: currency.currencyCode,
        },
        raw: true,
      });

      const currencyRate = (await helpers.getCurrenciesRates({ codes: [newCurrency] }))[0]!.rate;

      const updated = await helpers.updateAccount({
        id: account.id,
        payload: { creditLimit: 800 },
        raw: true,
      });

      expect(updated.creditLimit).toBe(800);
      expect(updated.refCreditLimit).toEqualRefValue(800 * currencyRate);
      // All balance fields unchanged
      expect(updated.currentBalance).toBe(account.currentBalance);
      expect(updated.refCurrentBalance).toBe(account.refCurrentBalance);
      expect(updated.initialBalance).toBe(account.initialBalance);
      expect(updated.refInitialBalance).toBe(account.refInitialBalance);
    });

    it('does not recalculate refCreditLimit when creditLimit is set to the same value', async () => {
      const newCurrency = 'UAH';
      const currency = (await helpers.addUserCurrencies({ currencyCodes: [newCurrency], raw: true })).currencies[0]!;

      const account = await helpers.createAccount({
        payload: {
          ...helpers.buildAccountPayload(),
          creditLimit: 500,
          currencyCode: currency.currencyCode,
        },
        raw: true,
      });

      const updated = await helpers.updateAccount({
        id: account.id,
        payload: { creditLimit: 500 },
        raw: true,
      });

      // Same value — refCreditLimit should remain unchanged
      expect(updated.creditLimit).toBe(account.creditLimit);
      expect(updated.refCreditLimit).toBe(account.refCreditLimit);
    });

    it('rejects creditLimit change on non-system account', async () => {
      const account = await helpers.createAccount({
        payload: {
          ...helpers.buildAccountPayload(),
          type: ACCOUNT_TYPES.monobank,
        },
        raw: true,
      });

      const res = await helpers.updateAccount({
        id: account.id,
        payload: { creditLimit: 1000 },
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('rejects creditLimit set to zero on non-system account', async () => {
      const account = await helpers.createAccount({
        payload: {
          ...helpers.buildAccountPayload(),
          type: ACCOUNT_TYPES.monobank,
        },
        raw: true,
      });

      const res = await helpers.updateAccount({
        id: account.id,
        payload: { creditLimit: 0 },
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('returns 404 when updating another user account', async () => {
      const account = await helpers.createAccount({ raw: true });
      const user2Cookies = await createSecondUser();

      const res = await asUser({
        cookies: user2Cookies,
        fn: () =>
          helpers.updateAccount({
            id: account.id,
            payload: { name: 'Hacked' },
            raw: false,
          }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('updates both creditLimit and currentBalance simultaneously', async () => {
      const account = await helpers.createAccount({
        payload: helpers.buildAccountPayload({
          initialBalance: 1000,
          creditLimit: 500,
        }),
        raw: true,
      });

      await createExpenseTransactions({ accountId: account.id, count: 2 });

      const afterTxs = await helpers.getAccount({ id: account.id, raw: true });
      expect(afterTxs.currentBalance).toBe(-1000);

      const updated = await helpers.updateAccount({
        id: afterTxs.id,
        payload: { creditLimit: 800, currentBalance: 0 },
        raw: true,
      });

      expect(updated.creditLimit).toBe(800);
      expect(updated.currentBalance).toBe(0);
      // initialBalance was 1000, currentBalance went from -1000 to 0 (+1000 delta)
      expect(updated.initialBalance).toBe(2000);
    });

    it('rejects currentBalance set to zero on non-system account', async () => {
      const account = await helpers.createAccount({
        payload: {
          ...helpers.buildAccountPayload(),
          type: ACCOUNT_TYPES.monobank,
        },
        raw: true,
      });

      const res = await helpers.updateAccount({
        id: account.id,
        payload: { currentBalance: 0 },
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('updates and declines monobank accounts update correctly', async () => {
      const account = await helpers.createAccount({
        payload: {
          ...helpers.buildAccountPayload(),
          type: ACCOUNT_TYPES.monobank,
        },
        raw: true,
      });
      const updatedAccount = await helpers.updateAccount({
        id: account.id,
        payload: {
          name: 'test test',
        },
        raw: true,
      });

      expect(updatedAccount.name).toBe('test test');

      const brokenUpdate = await helpers.updateAccount({
        id: account.id,
        payload: {
          currentBalance: 1000,
        },
      });

      expect(brokenUpdate.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});
