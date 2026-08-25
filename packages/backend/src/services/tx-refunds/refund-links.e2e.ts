import { type RecordId, TRANSACTION_TYPES } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { addDays } from 'date-fns';

const FUTURE_TIME = () => addDays(new Date(), 5).toISOString();

const PLANNED_REFUND_MESSAGE = 'A planned transaction cannot be part of a refund link.';

const listRefunds = async () => helpers.getRefundTransactions({ page: 1, limit: 10 }, true);

const getTx = async ({ id }: { id: string }) => (await helpers.getTransactionById({ id, raw: true }))!;

const errorMessage = ({ response }: { response: unknown }) =>
  (response as helpers.CustomResponse<{ message?: string }>).body.response?.message;

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
    it('rejects invalid query params', async () => {
      const statuses = {
        categoryId: (await helpers.getRefundTransactions({ categoryId: 'invalid-not-a-uuid' as unknown as string }))
          .statusCode,
        transactionType: (await helpers.getRefundTransactions({ transactionType: 'invalid' as TRANSACTION_TYPES }))
          .statusCode,
        accountId: (await helpers.getRefundTransactions({ accountId: 'invalid-not-a-uuid' as unknown as string }))
          .statusCode,
        page: (await helpers.getRefundTransactions({ page: -10 })).statusCode,
        limit: (await helpers.getRefundTransactions({ limit: -10 })).statusCode,
      };

      expect(statuses).toEqual({
        categoryId: ERROR_CODES.ValidationError,
        transactionType: ERROR_CODES.ValidationError,
        accountId: ERROR_CODES.ValidationError,
        page: ERROR_CODES.ValidationError,
        limit: ERROR_CODES.ValidationError,
      });
    });
  });
});

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

describe('Refund links against planned transactions', () => {
  let accountId: RecordId;

  beforeEach(async () => {
    accountId = (
      await helpers.createAccount({ payload: helpers.buildAccountPayload({ initialBalance: 1000 }), raw: true })
    ).id;
  });

  const createReal = async ({ amount, transactionType }: { amount: number; transactionType: TRANSACTION_TYPES }) => {
    const [tx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId, amount, transactionType }),
      raw: true,
    });
    return tx;
  };

  const createPlanned = async ({ amount, transactionType }: { amount: number; transactionType: TRANSACTION_TYPES }) => {
    const [tx] = await helpers.createPlannedTransaction({
      payload: { accountId, amount, transactionType, time: FUTURE_TIME() },
      raw: true,
    });
    return tx;
  };

  const expectNothingLinked = async ({ ids }: { ids: string[] }) => {
    expect((await listRefunds()).meta.total).toBe(0);

    for (const id of ids) {
      expect((await getTx({ id })).refundLinked).toBe(false);
    }
  };

  describe('PUT /transactions/:id with refundedByTxIds', () => {
    it('rejects a planned transaction as the refunding side', async () => {
      const original = await createReal({ amount: 100, transactionType: TRANSACTION_TYPES.expense });
      const planned = await createPlanned({ amount: 40, transactionType: TRANSACTION_TYPES.income });

      const response = await helpers.updateTransaction({
        id: original.id,
        payload: { refundedByTxIds: [planned.id] },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      expect(errorMessage({ response })).toBe(PLANNED_REFUND_MESSAGE);
      await expectNothingLinked({ ids: [original.id, planned.id] });
      expect((await getTx({ id: planned.id })).isPlanned).toBe(true);
      expect((await helpers.getAccount({ id: accountId, raw: true })).currentBalance).toBe(900);
    });

    it('rejects a planned refunding side whose amount exceeds the original', async () => {
      const original = await createReal({ amount: 100, transactionType: TRANSACTION_TYPES.expense });
      const planned = await createPlanned({ amount: 150, transactionType: TRANSACTION_TYPES.income });

      const response = await helpers.updateTransaction({
        id: original.id,
        payload: { refundedByTxIds: [planned.id] },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      expect(errorMessage({ response })).toBe(PLANNED_REFUND_MESSAGE);
      await expectNothingLinked({ ids: [original.id, planned.id] });
    });

    it('rejects a batch that mixes a real and a planned refunding side, linking neither', async () => {
      const original = await createReal({ amount: 100, transactionType: TRANSACTION_TYPES.expense });
      const real = await createReal({ amount: 30, transactionType: TRANSACTION_TYPES.income });
      const planned = await createPlanned({ amount: 30, transactionType: TRANSACTION_TYPES.income });

      const response = await helpers.updateTransaction({
        id: original.id,
        payload: { refundedByTxIds: [real.id, planned.id] },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      expect(errorMessage({ response })).toBe(PLANNED_REFUND_MESSAGE);
      await expectNothingLinked({ ids: [original.id, real.id, planned.id] });
    });

    it('keeps an existing real refund link intact when the replacing batch contains a plan', async () => {
      const original = await createReal({ amount: 100, transactionType: TRANSACTION_TYPES.expense });
      const real = await createReal({ amount: 30, transactionType: TRANSACTION_TYPES.income });
      const planned = await createPlanned({ amount: 30, transactionType: TRANSACTION_TYPES.income });

      await helpers.createSingleRefund({ originalTxId: original.id, refundTxId: real.id });

      const response = await helpers.updateTransaction({
        id: original.id,
        payload: { refundedByTxIds: [planned.id] },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);

      const refunds = await listRefunds();
      expect(refunds.meta.total).toBe(1);
      expect(refunds.data[0]!.refundTxId).toBe(real.id);
      expect((await getTx({ id: planned.id })).refundLinked).toBe(false);
    });
  });

  describe('PUT /transactions/:id with refundsTxId', () => {
    it('rejects a planned transaction as the original side', async () => {
      const planned = await createPlanned({ amount: 100, transactionType: TRANSACTION_TYPES.expense });
      const real = await createReal({ amount: 40, transactionType: TRANSACTION_TYPES.income });

      const response = await helpers.updateTransaction({
        id: real.id,
        payload: { refundsTxId: planned.id },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      expect(errorMessage({ response })).toBe(PLANNED_REFUND_MESSAGE);
      await expectNothingLinked({ ids: [real.id, planned.id] });
      expect((await getTx({ id: planned.id })).isPlanned).toBe(true);
    });

    it('rejects a planned row being pointed at a real original', async () => {
      const original = await createReal({ amount: 100, transactionType: TRANSACTION_TYPES.expense });
      const planned = await createPlanned({ amount: 40, transactionType: TRANSACTION_TYPES.income });

      const response = await helpers.updateTransaction({
        id: planned.id,
        payload: { refundsTxId: original.id },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      await expectNothingLinked({ ids: [original.id, planned.id] });
      expect((await getTx({ id: planned.id })).isPlanned).toBe(true);
    });

    it('rejects a planned row being marked as refunded by a real row', async () => {
      const planned = await createPlanned({ amount: 100, transactionType: TRANSACTION_TYPES.expense });
      const real = await createReal({ amount: 40, transactionType: TRANSACTION_TYPES.income });

      const response = await helpers.updateTransaction({
        id: planned.id,
        payload: { refundedByTxIds: [real.id] },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      await expectNothingLinked({ ids: [real.id, planned.id] });
      expect((await getTx({ id: planned.id })).isPlanned).toBe(true);
    });
  });

  describe('POST /transactions with refundForTxId', () => {
    it('rejects a real refund created for a planned original', async () => {
      const planned = await createPlanned({ amount: 100, transactionType: TRANSACTION_TYPES.expense });

      const response = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId,
          amount: 40,
          transactionType: TRANSACTION_TYPES.income,
          refundForTxId: planned.id,
        }),
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      expect(errorMessage({ response })).toBe(PLANNED_REFUND_MESSAGE);
      await expectNothingLinked({ ids: [planned.id] });
      expect((await getTx({ id: planned.id })).isPlanned).toBe(true);
    });
  });

  describe('POST /transactions/refund', () => {
    it('rejects a planned refunding side', async () => {
      const original = await createReal({ amount: 100, transactionType: TRANSACTION_TYPES.expense });
      const planned = await createPlanned({ amount: 40, transactionType: TRANSACTION_TYPES.income });

      const response = await helpers.createSingleRefund({ originalTxId: original.id, refundTxId: planned.id });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      await expectNothingLinked({ ids: [original.id, planned.id] });
    });

    it('rejects a planned original side', async () => {
      const planned = await createPlanned({ amount: 100, transactionType: TRANSACTION_TYPES.expense });
      const real = await createReal({ amount: 40, transactionType: TRANSACTION_TYPES.income });

      const response = await helpers.createSingleRefund({ originalTxId: planned.id, refundTxId: real.id });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      await expectNothingLinked({ ids: [real.id, planned.id] });
    });
  });
});
