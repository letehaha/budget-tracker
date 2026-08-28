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
    it('returns every refund when unfiltered and only the matching pair for each filter', async () => {
      const categories = await helpers.getCategoriesList();
      const expenseCategory = categories[0]!;
      const incomeCategory = categories[1]!;

      const expenseAccount = await helpers.createAccount({ raw: true });
      const incomeAccount = await helpers.createAccount({ raw: true });
      const orphanAccount = await helpers.createAccount({ raw: true });

      const [expenseOriginalTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: expenseAccount.id,
          categoryId: expenseCategory.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });
      const [expenseRefundTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: expenseAccount.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });
      const [incomeOriginalTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: incomeAccount.id,
          categoryId: incomeCategory.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });
      const [incomeRefundTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: incomeAccount.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });
      const [orphanRefundTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: orphanAccount.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });

      await helpers.createSingleRefund({ originalTxId: expenseOriginalTx.id, refundTxId: expenseRefundTx.id });
      await helpers.createSingleRefund({ originalTxId: incomeOriginalTx.id, refundTxId: incomeRefundTx.id });
      await helpers.createSingleRefund({ originalTxId: null, refundTxId: orphanRefundTx.id });

      const unfiltered = await helpers.getRefundTransactions({ page: 1, limit: 10 }, true);

      expect(unfiltered.data.length).toBe(3);
      expect(unfiltered.meta.total).toBe(3);

      const expectOnlyExpensePair = async ({
        filters,
      }: {
        filters: Parameters<typeof helpers.getRefundTransactions>[0];
      }) => {
        const response = await helpers.getRefundTransactions(filters, true);

        expect(response.meta.total).toBe(1);
        expect(response.data.length).toBe(1);
        expect(response.data[0]!.originalTxId).toBe(expenseOriginalTx.id);
        expect(response.data[0]!.originalTransaction?.id).toBe(expenseOriginalTx.id);
        expect(response.data[0]!.refundTxId).toBe(expenseRefundTx.id);
      };

      await expectOnlyExpensePair({ filters: { categoryId: expenseCategory.id } });
      await expectOnlyExpensePair({ filters: { transactionType: TRANSACTION_TYPES.expense } });
      await expectOnlyExpensePair({ filters: { accountId: expenseAccount.id } });
      await expectOnlyExpensePair({
        filters: {
          categoryId: expenseCategory.id,
          transactionType: TRANSACTION_TYPES.expense,
          accountId: expenseAccount.id,
        },
      });
    }, 20000);

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
    it('rejects a planned refunding side on its own, over the original amount, and mixed with a real one', async () => {
      const original = await createReal({ amount: 100, transactionType: TRANSACTION_TYPES.expense });
      const plannedUnderOriginal = await createPlanned({ amount: 40, transactionType: TRANSACTION_TYPES.income });
      const plannedOverOriginal = await createPlanned({ amount: 150, transactionType: TRANSACTION_TYPES.income });
      const real = await createReal({ amount: 30, transactionType: TRANSACTION_TYPES.income });

      const refundedBy = async ({ refundedByTxIds }: { refundedByTxIds: string[] }) => {
        const response = await helpers.updateTransaction({ id: original.id, payload: { refundedByTxIds } });

        return { statusCode: response.statusCode, message: errorMessage({ response }) };
      };

      const rejection = { statusCode: ERROR_CODES.ValidationError, message: PLANNED_REFUND_MESSAGE };

      expect(await refundedBy({ refundedByTxIds: [plannedUnderOriginal.id] })).toEqual(rejection);
      expect(await refundedBy({ refundedByTxIds: [plannedOverOriginal.id] })).toEqual(rejection);
      expect(await refundedBy({ refundedByTxIds: [real.id, plannedUnderOriginal.id] })).toEqual(rejection);

      await expectNothingLinked({
        ids: [original.id, plannedUnderOriginal.id, plannedOverOriginal.id, real.id],
      });
      expect((await getTx({ id: plannedUnderOriginal.id })).isPlanned).toBe(true);
      expect((await getTx({ id: plannedOverOriginal.id })).isPlanned).toBe(true);
      expect((await helpers.getAccount({ id: accountId, raw: true })).currentBalance).toBe(930);
    }, 20000);

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
    it('rejects a planned transaction on either side of the link', async () => {
      const plannedOriginal = await createPlanned({ amount: 100, transactionType: TRANSACTION_TYPES.expense });
      const realRefund = await createReal({ amount: 40, transactionType: TRANSACTION_TYPES.income });
      const realOriginal = await createReal({ amount: 100, transactionType: TRANSACTION_TYPES.expense });
      const plannedRefund = await createPlanned({ amount: 40, transactionType: TRANSACTION_TYPES.income });

      const plannedAsOriginal = await helpers.updateTransaction({
        id: realRefund.id,
        payload: { refundsTxId: plannedOriginal.id },
      });

      expect(plannedAsOriginal.statusCode).toBe(ERROR_CODES.ValidationError);
      expect(errorMessage({ response: plannedAsOriginal })).toBe(PLANNED_REFUND_MESSAGE);

      const plannedPointedAtOriginal = await helpers.updateTransaction({
        id: plannedRefund.id,
        payload: { refundsTxId: realOriginal.id },
      });

      expect(plannedPointedAtOriginal.statusCode).toBe(ERROR_CODES.ValidationError);

      const plannedMarkedAsRefunded = await helpers.updateTransaction({
        id: plannedOriginal.id,
        payload: { refundedByTxIds: [realRefund.id] },
      });

      expect(plannedMarkedAsRefunded.statusCode).toBe(ERROR_CODES.ValidationError);

      await expectNothingLinked({
        ids: [plannedOriginal.id, realRefund.id, realOriginal.id, plannedRefund.id],
      });
      expect((await getTx({ id: plannedOriginal.id })).isPlanned).toBe(true);
      expect((await getTx({ id: plannedRefund.id })).isPlanned).toBe(true);
    }, 20000);
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
    it('rejects a planned transaction on either side of the link', async () => {
      const realOriginal = await createReal({ amount: 100, transactionType: TRANSACTION_TYPES.expense });
      const plannedRefund = await createPlanned({ amount: 40, transactionType: TRANSACTION_TYPES.income });
      const plannedOriginal = await createPlanned({ amount: 100, transactionType: TRANSACTION_TYPES.expense });
      const realRefund = await createReal({ amount: 40, transactionType: TRANSACTION_TYPES.income });

      const plannedAsRefund = await helpers.createSingleRefund({
        originalTxId: realOriginal.id,
        refundTxId: plannedRefund.id,
      });

      expect(plannedAsRefund.statusCode).toBe(ERROR_CODES.ValidationError);

      const plannedAsOriginal = await helpers.createSingleRefund({
        originalTxId: plannedOriginal.id,
        refundTxId: realRefund.id,
      });

      expect(plannedAsOriginal.statusCode).toBe(ERROR_CODES.ValidationError);

      await expectNothingLinked({
        ids: [realOriginal.id, plannedRefund.id, plannedOriginal.id, realRefund.id],
      });
    }, 20000);
  });
});
