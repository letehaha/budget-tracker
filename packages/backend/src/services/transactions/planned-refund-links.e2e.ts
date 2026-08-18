import { type RecordId, TRANSACTION_TYPES } from '@bt/shared/types';
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
