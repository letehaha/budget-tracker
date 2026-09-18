import { asDecimal } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Account transaction count', () => {
  describe('GET /accounts/:id/transaction-count', () => {
    it('counts every transaction on the account, not just the first page', async () => {
      const account = await helpers.createAccount({ raw: true });
      const otherAccount = await helpers.createAccount({ raw: true });

      const TRANSACTIONS_TO_CREATE = 12;
      for (let i = 0; i < TRANSACTIONS_TO_CREATE; i++) {
        await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({ accountId: account.id }),
          raw: true,
        });
      }
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: otherAccount.id }),
        raw: true,
      });

      const result = await helpers.getAccountTransactionCount({ id: account.id, raw: true });

      expect(result.transactionCount).toBe(TRANSACTIONS_TO_CREATE);
    });

    it('includes planned transactions and balance adjustments', async () => {
      const account = await helpers.createAccount({ raw: true });

      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });
      await helpers.createPlannedTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });
      await helpers.balanceAdjustment({
        id: account.id,
        payload: { targetBalance: asDecimal(5000) },
        raw: true,
      });

      const result = await helpers.getAccountTransactionCount({ id: account.id, raw: true });

      expect(result.transactionCount).toBe(3);
    });

    it('returns 0 for an account without transactions', async () => {
      const account = await helpers.createAccount({ raw: true });

      const result = await helpers.getAccountTransactionCount({ id: account.id, raw: true });

      expect(result.transactionCount).toBe(0);
    });

    it('returns 404 for a non-existent account', async () => {
      const res = await helpers.getAccountTransactionCount({ id: generateRandomRecordId() });

      expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('returns 404 for an account owned by another user', async () => {
      const account = await helpers.createAccount({ raw: true });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });

      const secondUser = await helpers.signUpSecondUser();
      const res = await helpers.asUser({
        cookies: secondUser.cookies,
        fn: () => helpers.getAccountTransactionCount({ id: account.id }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });
});
