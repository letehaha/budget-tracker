import { TRANSACTION_TYPES } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('removeRefundLink', () => {
  describe('success cases', () => {
    it('successfully removes a refund link between two transactions', async () => {
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

      const creationResponse = await helpers.createSingleRefund({
        originalTxId: originalTx.id,
        refundTxId: refundTx.id,
      });

      expect(creationResponse.statusCode).toBe(200);

      let transactions = await helpers.getTransactions({ raw: true });

      expect(transactions.every((tx) => tx.refundLinked)).toBe(true);

      const deletionResponse = await helpers.deleteRefund({
        originalTxId: originalTx.id,
        refundTxId: refundTx.id,
      });

      expect(deletionResponse.statusCode).toBe(200);

      const getResponse = await helpers.getSingleRefund({
        originalTxId: originalTx.id,
        refundTxId: refundTx.id,
      });

      expect(getResponse.statusCode).toBe(404);

      transactions = await helpers.getTransactions({ raw: true });

      // Check that after refund deletion all transactions are in place
      expect([originalTx.id, refundTx.id].every((id) => transactions.find((tx) => tx.id === id))).toBe(true);
      expect(transactions.every((tx) => !tx.refundLinked)).toBe(true);
    });

    it('successfully removes a refund link between two transactions when some transaction is deleted', async () => {
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

      const creationResponse = await helpers.createSingleRefund({
        originalTxId: originalTx.id,
        refundTxId: refundTx.id,
      });

      expect(creationResponse.statusCode).toBe(200);

      let transactions = await helpers.getTransactions({ raw: true });

      expect(transactions.every((tx) => tx.refundLinked)).toBe(true);

      await helpers.deleteTransaction({ id: refundTx.id });

      const getResponse = await helpers.getSingleRefund({
        originalTxId: originalTx.id,
        refundTxId: refundTx.id,
      });

      expect(getResponse.statusCode).toBe(404);

      transactions = await helpers.getTransactions({ raw: true });
      expect(transactions.every((tx) => !tx.refundLinked)).toBe(true);
    });
  });

  describe('failure cases', () => {
    it('fails when refund link does not exist', async () => {
      const response = await helpers.deleteRefund({
        originalTxId: generateRandomRecordId(),
        refundTxId: generateRandomRecordId(),
      });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('fails when one of the transactions does not exist', async () => {
      const account = await helpers.createAccount({ raw: true });

      const [baseTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      let response = await helpers.deleteRefund({
        originalTxId: baseTx.id,
        refundTxId: generateRandomRecordId(),
      });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);

      response = await helpers.deleteRefund({
        originalTxId: generateRandomRecordId(),
        refundTxId: baseTx.id,
      });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('fails when no required params provided', async () => {
      const response = await helpers.makeRequest({
        method: 'delete',
        url: '/transactions/refund',
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('original transaction with several refunds', () => {
    const buildScenario = async () => {
      const account = await helpers.createAccount({ raw: true });
      const rootCategory = (await helpers.getCategoriesList()).find((category) => !category.parentId)!;

      const [originalTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          categoryId: rootCategory.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const [firstRefundTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 40,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });

      const [secondRefundTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 30,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });

      for (const refundTx of [firstRefundTx, secondRefundTx]) {
        const response = await helpers.createSingleRefund({
          originalTxId: originalTx.id,
          refundTxId: refundTx.id,
        });
        expect(response.statusCode).toBe(200);
      }

      return { rootCategory, originalTx, firstRefundTx, secondRefundTx };
    };

    it('leaves the original flagged as refunded while another refund still points at it', async () => {
      const { originalTx, firstRefundTx, secondRefundTx } = await buildScenario();

      const removal = await helpers.deleteRefund({
        originalTxId: originalTx.id,
        refundTxId: firstRefundTx.id,
      });
      expect(removal.statusCode).toBe(200);

      const transactions = await helpers.getTransactions({ raw: true });
      const refundLinkedOf = (id: string) => transactions.find((tx) => tx.id === id)!.refundLinked;

      expect(refundLinkedOf(originalTx.id)).toBe(true);
      expect(refundLinkedOf(firstRefundTx.id)).toBe(false);
      expect(refundLinkedOf(secondRefundTx.id)).toBe(true);
    });

    it('leaves the original flagged when one of its refund transactions is deleted', async () => {
      const { originalTx, firstRefundTx, secondRefundTx } = await buildScenario();

      await helpers.deleteTransaction({ id: firstRefundTx.id });

      const transactions = await helpers.getTransactions({ raw: true });
      const refundLinkedOf = (id: string) => transactions.find((tx) => tx.id === id)!.refundLinked;

      expect(refundLinkedOf(originalTx.id)).toBe(true);
      expect(refundLinkedOf(secondRefundTx.id)).toBe(true);
    });

    it('leaves the original flagged when one of its refunds is repointed to another purchase', async () => {
      const account = await helpers.createAccount({ raw: true });
      const { originalTx, firstRefundTx, secondRefundTx } = await buildScenario();

      const [otherPurchase] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      await helpers.updateTransaction({
        id: firstRefundTx.id,
        payload: { refundsTxId: otherPurchase.id },
        raw: true,
      });

      const transactions = await helpers.getTransactions({ raw: true });
      const refundLinkedOf = (id: string) => transactions.find((tx) => tx.id === id)!.refundLinked;

      expect(refundLinkedOf(originalTx.id)).toBe(true);
      expect(refundLinkedOf(secondRefundTx.id)).toBe(true);
      expect(refundLinkedOf(otherPurchase.id)).toBe(true);
      expect(refundLinkedOf(firstRefundTx.id)).toBe(true);
    });

    it('keeps netting the surviving refund out of the expenses report', async () => {
      const { rootCategory, originalTx, firstRefundTx } = await buildScenario();

      const beforeRemoval = await helpers.getSpendingsByCategories({ raw: true });
      expect(beforeRemoval[rootCategory.id].amount).toBe(30);

      await helpers.deleteRefund({ originalTxId: originalTx.id, refundTxId: firstRefundTx.id });

      const afterRemoval = await helpers.getSpendingsByCategories({ raw: true });
      expect(afterRemoval[rootCategory.id].amount).toBe(70);
    });
  });

  describe('removeRefundLink with optional originalTxId', () => {
    describe('success cases', () => {
      it('successfully removes a refund link with null originalTxId', async () => {
        const account = await helpers.createAccount({ raw: true });

        const [refundTx] = await helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: account.id,
            amount: 100,
            transactionType: TRANSACTION_TYPES.income,
          }),
          raw: true,
        });

        const creationResponse = await helpers.createSingleRefund({
          originalTxId: null,
          refundTxId: refundTx.id,
        });

        expect(creationResponse.statusCode).toBe(200);

        const deletionResponse = await helpers.deleteRefund({
          originalTxId: null,
          refundTxId: refundTx.id,
        });

        expect(deletionResponse.statusCode).toBe(200);

        const getResponse = await helpers.getSingleRefund({
          originalTxId: null,
          refundTxId: refundTx.id,
        });

        expect(getResponse.statusCode).toBe(ERROR_CODES.ValidationError);

        const transactions = await helpers.getTransactions({ raw: true });

        // Check that after refund deletion the refund transaction is still in place
        expect(transactions.some((tx) => tx.id === refundTx.id)).toBe(true);
      });
    });

    describe('failure cases', () => {
      it('fails when trying to remove a non-existent refund link with null originalTxId', async () => {
        const response = await helpers.deleteRefund({
          originalTxId: null,
          refundTxId: generateRandomRecordId(),
        });

        expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
      });

      it('fails when trying to remove a refund link with null originalTxId that was created with a non-null originalTxId', async () => {
        const account = await helpers.createAccount({ raw: true });

        const [originalTx, refundTx] = await Promise.all([
          helpers.createTransaction({
            payload: helpers.buildTransactionPayload({
              accountId: account.id,
              amount: 100,
              transactionType: TRANSACTION_TYPES.expense,
            }),
            raw: true,
          }),
          helpers.createTransaction({
            payload: helpers.buildTransactionPayload({
              accountId: account.id,
              amount: 100,
              transactionType: TRANSACTION_TYPES.income,
            }),
            raw: true,
          }),
        ]);

        await helpers.createSingleRefund({
          originalTxId: originalTx[0].id,
          refundTxId: refundTx[0].id,
        });

        const response = await helpers.deleteRefund({
          originalTxId: null,
          refundTxId: refundTx[0].id,
        });

        expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
      });
    });
  });
});
