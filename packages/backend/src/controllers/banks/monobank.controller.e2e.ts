import { ACCOUNT_TYPES, API_ERROR_CODES } from '@bt/shared/types';
import { faker } from '@faker-js/faker';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { INVALID_MONOBANK_TOKEN } from '@tests/mocks/monobank/mock-api';
import { isSameDay, subDays } from 'date-fns';

describe('Monobank integration', () => {
  describe('Pair Monobank account', () => {
    it('throws validation error if no "token" passed', async () => {
      const result = await helpers.makeRequest({
        method: 'post',
        url: '/banks/monobank/pair-user',
      });

      expect(result.status).toEqual(ERROR_CODES.ValidationError);
    });
    it('throws error if invalid "token" is passed', async () => {
      const result = await helpers.monobank.pair(INVALID_MONOBANK_TOKEN);

      expect(result.status).toEqual(ERROR_CODES.Forbidden);
    });
    it('creates Monobank user and correct accounts with valid token', async () => {
      const mockedClientData = helpers.monobank.mockedClientData();
      const createdMonoUserRestult = await helpers.monobank.pair();

      expect(helpers.extractResponse(createdMonoUserRestult).apiToken).toBe(helpers.monobank.mockedToken);
      expect(helpers.extractResponse(createdMonoUserRestult).accounts.length).toBe(mockedClientData.accounts.length);

      const accountResult = await helpers.getAccounts();

      // temp hack to not rewrite API hard
      const CURRENCY_NUMBER_TO_CODE = {
        980: 'UAH',
        840: 'USD',
      };

      for (const item of mockedClientData.accounts) {
        const mockedAccount = item;
        const resultItem = accountResult.find((acc) => acc.externalId === item.id)!;

        const rates = await helpers.getCurrenciesRates();
        const rate = rates.find((r) => r.baseCode === CURRENCY_NUMBER_TO_CODE[item.currencyCode])!.rate;

        expect(resultItem.initialBalance).toBe(mockedAccount.balance);
        expect(resultItem.refInitialBalance).toBe(Math.floor(mockedAccount.balance * rate));
        expect(resultItem.currentBalance).toBe(mockedAccount.balance);
        expect(resultItem.refCurrentBalance).toBe(Math.floor(mockedAccount.balance * rate));
        expect(resultItem.creditLimit).toBe(mockedAccount.creditLimit);
        expect(resultItem.refCreditLimit).toBe(Math.floor(mockedAccount.creditLimit * rate));
        expect(resultItem.type).toBe(ACCOUNT_TYPES.monobank);
        // By default all Monobank accounts should be disabled so we will load
        // new transactions only to accounts that user choosed
        expect(resultItem.isEnabled).toBe(false);
      }
    });
    it('handles case when trying to pair existing account', async () => {
      const result = await helpers.monobank.pair();

      expect(result.status).toBe(200);

      const oneMoreResult = await helpers.monobank.pair();

      expect(helpers.extractResponse(oneMoreResult).code).toBe(API_ERROR_CODES.monobankUserAlreadyConnected);
    });
  });
  describe('[getUser] to get monobank user', () => {
    it('Returns correct error when user not found', async () => {
      const result = await helpers.makeRequest({
        method: 'get',
        url: '/banks/monobank/user',
      });

      expect(helpers.extractResponse(result).code).toEqual(API_ERROR_CODES.monobankUserNotPaired);
    });
    it('Returns correct user', async () => {
      await helpers.monobank.pair();

      const result = await helpers.makeRequest({
        method: 'get',
        url: '/banks/monobank/user',
      });

      expect(helpers.extractResponse(result).apiToken).toEqual(helpers.monobank.mockedToken);
    });
  });
  describe('[loadTransactions]', () => {
    it('returns validation error if some field is missing', async () => {
      const result = await helpers.makeRequest({
        method: 'get',
        url: '/banks/monobank/load-transactions',
      });

      expect(result.status).toEqual(ERROR_CODES.ValidationError);
    });
    it('returns 404 if user is not paired', async () => {
      const result = await helpers.makeRequest({
        method: 'get',
        url: '/banks/monobank/load-transactions',
        payload: {
          from: new Date().getTime(),
          to: new Date().getTime(),
          accountId: faker.finance.accountNumber(6),
        },
      });

      expect(result.status).toEqual(ERROR_CODES.NotFoundError);
    });
    it('returns 404 if calling for unexisting account', async () => {
      await helpers.monobank.pair();

      const result = await helpers.makeRequest({
        method: 'get',
        url: '/banks/monobank/load-transactions',
        payload: {
          from: new Date().getTime(),
          to: new Date().getTime(),
          accountId: faker.finance.accountNumber(6),
        },
      });

      expect(result.status).toEqual(ERROR_CODES.NotFoundError);
    });

    describe('test transactions creation', () => {
      let account;
      const transactionsAmount = 10;

      beforeEach(async () => {
        jest.clearAllMocks();
        // To prevent DB deadlock. Dunno why it happens
        await helpers.sleep(500);

        await helpers.monobank.pair();
        const result = await helpers.monobank.mockTransactions();
        account = result.account;
      });

      it('creates transactions from loaded ones', async () => {
        // Since there's a queue inside and it's async
        await helpers.sleep(500);

        const transactions = await helpers.monobank.getTransactions();

        let balanceHistory = helpers.extractResponse(
          await helpers.makeRequest({
            method: 'get',
            url: '/stats/balance-history',
            payload: {
              accountId: account.id,
            },
          }),
        );

        // There will always be one record that is associated with acocunt creation date,
        // so we need to ignore it, to check only transactions that were just created
        balanceHistory = balanceHistory.filter((item) => item.amount === account.balance);

        expect(transactions.length).toBe(transactionsAmount);
        expect(transactions.every((item) => item.accountType === ACCOUNT_TYPES.monobank)).toBe(true);

        balanceHistory.forEach((historyRecord) => {
          const transaction = transactions.find((item) => isSameDay(new Date(item.time), new Date(historyRecord.date)));

          expect(historyRecord.amount).toBe(transaction.externalData.balance);
        });
      });

      it.skip('returns tooManyRequests if trying to load transactions while previous queue exists', async () => {
        const result = await helpers.makeRequest({
          method: 'get',
          url: '/banks/monobank/load-transactions',
          payload: {
            from: subDays(new Date(), 2).getTime(),
            to: new Date().getTime(),
            accountId: account.id,
          },
        });

        expect(result.status).toEqual(ERROR_CODES.TooManyRequests);
      });

      // For some reason this test doesn't work as intended. `pairMonobankUser` inside `beforeEach` should
      // mock the response of monobank client-info loading, but doesn't do that.
      it.skip('returns tooManyRequests if trying to load transactions right after previous load', async () => {
        // Make sure that queue is empty
        await helpers.sleep(500);

        // TODO:
        // (axios as any).mockRejectedValueOnce({
        //   response: {
        //     status: ERROR_CODES.TooManyRequests,
        //   },
        // });

        // First call throws an error and stores blocker to Redis, but returns 200
        // because the error occurs asynchronously
        const result1 = await helpers.makeRequest({
          method: 'get',
          url: '/banks/monobank/load-transactions',
          payload: {
            from: subDays(new Date(), 2).getTime(),
            to: new Date().getTime(),
            accountId: account.id,
          },
        });

        expect(result1.status).toEqual(200);

        // Second call checks that now we have correct error
        const result = await helpers.makeRequest({
          method: 'get',
          url: '/banks/monobank/load-transactions',
          payload: {
            from: subDays(new Date(), 2).getTime(),
            to: new Date().getTime(),
            accountId: account.id,
          },
        });

        expect(result.status).toEqual(ERROR_CODES.TooManyRequests);
      });
    });
  });
});
