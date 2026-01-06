import { TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('getRefundTransactions', () => {
  describe('success cases', () => {
    it('successfully retrieves all refund transactions when no filters are applied', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [originalTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });
      const [refundTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });

      await helpers.createSingleRefund({
        originalTxId: originalTx.id,
        refundTxId: refundTx.id,
      });

      const response = await helpers.getRefundTransactions({});

      expect(response.statusCode).toBe(200);
      expect(helpers.extractResponse(response).data.length).toBe(1);
      expect(helpers.extractResponse(response).meta.total).toBe(1);
    });

    it('successfully filters refund transactions by categoryId', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [originalTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });
      const categoryId = originalTx.categoryId;
      const [refundTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });

      await helpers.createSingleRefund({
        originalTxId: originalTx.id,
        refundTxId: refundTx.id,
      });

      const response = await helpers.getRefundTransactions({
        categoryId: categoryId,
      });

      expect(response.statusCode).toBe(200);

      expect(helpers.extractResponse(response).data.length).toBe(1);
      expect(
        helpers.extractResponse(response).data.every((refund) => refund.originalTransaction.categoryId === categoryId),
      ).toBe(true);
    });

    it('successfully filters refund transactions by transactionType', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [originalTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });
      const [refundTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });

      await helpers.createSingleRefund({
        originalTxId: originalTx.id,
        refundTxId: refundTx.id,
      });

      const response = await helpers.getRefundTransactions({ transactionType: TRANSACTION_TYPES.expense }, true);

      expect(response.data.length).toBeGreaterThan(0);
      expect(
        response.data.every((refund) => refund.originalTransaction.transactionType === TRANSACTION_TYPES.expense),
      ).toBe(true);
    });

    it('successfully filters refund transactions by accountId', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [originalTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });
      const [refundTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });

      await helpers.createSingleRefund({
        originalTxId: originalTx.id,
        refundTxId: refundTx.id,
      });

      const response = await helpers.getRefundTransactions({ accountId: account.id }, true);

      expect(response.data.length).toBeGreaterThan(0);
      expect(response.data.every((refund) => refund.originalTransaction.accountId === account.id)).toBe(true);
    });

    it('successfully applies multiple filters simultaneously', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [originalTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });
      const categoryId = originalTx.categoryId;
      const [refundTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });

      await helpers.createSingleRefund({
        originalTxId: originalTx.id,
        refundTxId: refundTx.id,
      });

      const response = await helpers.getRefundTransactions(
        {
          categoryId,
          transactionType: TRANSACTION_TYPES.expense,
          accountId: account.id,
        },
        true,
      );

      expect(response.data.length).toBeGreaterThan(0);
      expect(
        response.data.every(
          (refund) =>
            refund.originalTransaction.categoryId === categoryId &&
            refund.originalTransaction.transactionType === TRANSACTION_TYPES.expense &&
            refund.originalTransaction.accountId === account.id,
        ),
      ).toBe(true);
    });

    it.todo('successfully applies pagination');
    // it('successfully applies pagination', async () => {
    //   const account = await helpers.createAccount({ raw: true });
    //   // Create multiple refund transactions here...

    //   const response1 = await helpers.getRefundTransactions({ page: 1, limit: 1 }, true);
    //   const response2 = await helpers.getRefundTransactions({ page: 2, limit: 1 }, true);

    //   expect(response1.success).toBe(true);
    //   expect(response2.success).toBe(true);
    //   expect(response1.data.length).toBe(1);
    //   expect(response2.data.length).toBe(1);
    //   expect(response1.data[0].id).not.toBe(response2.data[0].id);
    //   expect(response1.meta.page).toBe(1);
    //   expect(response2.meta.page).toBe(2);
    // });
  });

  describe('failure cases', () => {
    it('fails when invalid categoryId is provided', async () => {
      const response = await helpers.getRefundTransactions({ categoryId: -10 });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails when invalid transactionType is provided', async () => {
      const response = await helpers.getRefundTransactions({
        transactionType: 'invalid' as TRANSACTION_TYPES,
      });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails when invalid accountId is provided', async () => {
      const response = await helpers.getRefundTransactions({ accountId: -10 });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails when invalid page number is provided', async () => {
      const response = await helpers.getRefundTransactions({ page: -10 });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails when invalid limit is provided', async () => {
      const response = await helpers.getRefundTransactions({ limit: -10 });
      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });
});
