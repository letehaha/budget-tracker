import { ACCOUNT_TYPES, API_ERROR_CODES } from '@bt/shared/types';
import { roundHalfToEven } from '@common/utils/round-half-to-even';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { addDays } from 'date-fns';

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
      expect(account.refInitialBalance).toStrictEqual(roundHalfToEven(initialBalance * currencyRate!.rate));
      expect(account.currentBalance).toStrictEqual(initialBalance);
      expect(account.refCurrentBalance).toStrictEqual(roundHalfToEven(initialBalance * currencyRate!.rate));
      expect(account.creditLimit).toStrictEqual(creditLimit);
      expect(account.refCreditLimit).toStrictEqual(roundHalfToEven(creditLimit * currencyRate!.rate));
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

      // Create 3 expense transactions with -1000 each
      for (const index in Array(3).fill(0)) {
        await helpers.createTransaction({
          payload: {
            ...helpers.buildTransactionPayload({ accountId: account.id }),
            time: addDays(new Date(), +index + 1).toISOString(),
          },
        });
      }

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

      // Create 3 expense transactions with -1000 each
      for (const index in Array(3).fill(0)) {
        await helpers.createTransaction({
          payload: {
            ...helpers.buildTransactionPayload({ accountId: account.id }),
            time: addDays(new Date(), +index + 1).toISOString(),
          },
        });
      }

      const accountAfterTxs = await helpers.getAccount({
        id: account.id,
        raw: true,
      });
      const currencyRate = (await helpers.getCurrenciesRates({ codes: [newCurrency] }))[0]!.rate;
      expect(accountAfterTxs.initialBalance).toBe(0);
      expect(accountAfterTxs.refInitialBalance).toBe(0);
      expect(accountAfterTxs.currentBalance).toBe(-3000);
      expect(accountAfterTxs.refCurrentBalance).toBeWithinRange(-3000 * currencyRate, 2);

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
      expect(accountUpdateBalance.refInitialBalance).toBeWithinRange(2500 * currencyRate, 2);
      expect(accountUpdateBalance.currentBalance).toBe(-500);
      expect(accountUpdateBalance.refCurrentBalance).toBeWithinRange(-500 * currencyRate, 2);
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
