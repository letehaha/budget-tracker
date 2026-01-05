import { TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Delete transaction splits', () => {
  it('should delete a single split from transaction', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();

    // Create transaction with splits
    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: categories[0]!.id,
      amount: 1000,
      splits: [
        { categoryId: categories[1]!.id, amount: 300 },
        { categoryId: categories[2]!.id, amount: 200 },
      ],
    });

    await helpers.createTransaction({ payload: txPayload, raw: false });

    // Get transaction with splits
    const transactions = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    expect(transactions).toHaveLength(1);
    expect(transactions![0]!.splits).toHaveLength(2);

    const splitToDelete = transactions![0]!.splits![0]!;

    // Delete one split
    const deleteRes = await helpers.deleteSplit({ splitId: splitToDelete.id });
    expect(deleteRes.statusCode).toBe(200);

    // Verify split was deleted
    const updatedTransactions = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    expect(updatedTransactions![0]!.splits).toHaveLength(1);
    expect(updatedTransactions![0]!.splits![0]!.id).not.toBe(splitToDelete.id);
  });

  it('should delete the last split from transaction', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();

    // Create transaction with one split
    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: categories[0]!.id,
      amount: 1000,
      splits: [{ categoryId: categories[1]!.id, amount: 400 }],
    });

    await helpers.createTransaction({ payload: txPayload, raw: false });

    const transactions = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    const splitId = transactions![0]!.splits![0]!.id;

    // Delete the only split
    const deleteRes = await helpers.deleteSplit({ splitId });
    expect(deleteRes.statusCode).toBe(200);

    // Verify no splits remain
    const updatedTransactions = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    expect(updatedTransactions![0]!.splits).toHaveLength(0);
  });

  it('should reject deleting non-existent split', async () => {
    const fakeUuid = '019b8b00-0000-7000-0000-000000000000';

    const deleteRes = await helpers.deleteSplit({ splitId: fakeUuid });
    // Should return error status (404 NotFound or 422 if validation layer catches it first)
    expect(deleteRes.statusCode).toBeGreaterThanOrEqual(400);
    expect(deleteRes.statusCode).toBeLessThan(500);
  });

  it('should not affect transaction amount when deleting split', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();

    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: categories[0]!.id,
      amount: 1000,
      splits: [{ categoryId: categories[1]!.id, amount: 400 }],
    });

    await helpers.createTransaction({ payload: txPayload, raw: false });

    const transactions = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    const originalAmount = transactions![0]!.amount;
    const splitId = transactions![0]!.splits![0]!.id;

    // Delete split
    await helpers.deleteSplit({ splitId });

    // Verify transaction amount unchanged
    const updatedTransactions = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    expect(updatedTransactions![0]!.amount).toBe(originalAmount);
  });

  describe('splits with refunds', () => {
    it('should reject deleting split that has refund targeting it', async () => {
      const account = await helpers.createAccount({ raw: true });
      const categories = await helpers.getCategoriesList();

      // Create expense transaction with split
      const [expenseTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          categoryId: categories[0]!.id,
          amount: 10000,
          transactionType: TRANSACTION_TYPES.expense,
          splits: [{ categoryId: categories[1]!.id, amount: 3000 }],
        }),
        raw: true,
      });

      const transactions = await helpers.getTransactions({
        raw: true,
        includeSplits: true,
      });
      const split = transactions![0]!.splits![0]!;

      // Create refund targeting the split
      const [refundTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          categoryId: categories[1]!.id,
          amount: 2000,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });

      await helpers.createSingleRefund({
        originalTxId: expenseTx.id,
        refundTxId: refundTx.id,
        splitId: split.id,
      });

      // Try to delete the split with refund
      const deleteRes = await helpers.deleteSplit({ splitId: split.id });

      expect(deleteRes.statusCode).toEqual(ERROR_CODES.ValidationError);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((deleteRes.body.response as any).message).toContain('Cannot delete split that has refunds');
    });

    it('should allow deleting split after refund is unlinked', async () => {
      const account = await helpers.createAccount({ raw: true });
      const categories = await helpers.getCategoriesList();

      // Create expense transaction with split
      const [expenseTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          categoryId: categories[0]!.id,
          amount: 10000,
          transactionType: TRANSACTION_TYPES.expense,
          splits: [{ categoryId: categories[1]!.id, amount: 3000 }],
        }),
        raw: true,
      });

      const transactions = await helpers.getTransactions({
        raw: true,
        includeSplits: true,
      });
      const split = transactions![0]!.splits![0]!;

      // Create refund targeting the split
      const [refundTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          categoryId: categories[1]!.id,
          amount: 2000,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });

      await helpers.createSingleRefund({
        originalTxId: expenseTx.id,
        refundTxId: refundTx.id,
        splitId: split.id,
      });

      // Unlink the refund
      await helpers.deleteRefund({
        originalTxId: expenseTx.id,
        refundTxId: refundTx.id,
      });

      // Now deleting the split should work
      const deleteRes = await helpers.deleteSplit({ splitId: split.id });

      expect(deleteRes.statusCode).toBe(200);

      // Verify split was deleted
      const updatedTransactions = await helpers.getTransactions({
        raw: true,
        includeSplits: true,
      });

      expect(updatedTransactions![0]!.splits).toHaveLength(0);
    });

    it('should allow deleting split without refund when sibling split has refund', async () => {
      const account = await helpers.createAccount({ raw: true });
      const categories = await helpers.getCategoriesList();

      // Create expense transaction with two splits
      const [expenseTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          categoryId: categories[0]!.id,
          amount: 10000,
          transactionType: TRANSACTION_TYPES.expense,
          splits: [
            { categoryId: categories[1]!.id, amount: 3000 },
            { categoryId: categories[2]!.id, amount: 2000 },
          ],
        }),
        raw: true,
      });

      const transactions = await helpers.getTransactions({
        raw: true,
        includeSplits: true,
      });
      const split1 = transactions![0]!.splits![0]!;
      const split2 = transactions![0]!.splits![1]!;

      // Create refund targeting only the first split
      const [refundTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          categoryId: categories[1]!.id,
          amount: 2000,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });

      await helpers.createSingleRefund({
        originalTxId: expenseTx.id,
        refundTxId: refundTx.id,
        splitId: split1.id,
      });

      // Deleting split2 (which has no refund) should work
      const deleteRes = await helpers.deleteSplit({ splitId: split2.id });

      expect(deleteRes.statusCode).toBe(200);

      // Verify only split2 was deleted
      const updatedTransactions = await helpers.getTransactions({
        raw: true,
        includeSplits: true,
      });

      expect(updatedTransactions![0]!.splits).toHaveLength(1);
      expect(updatedTransactions![0]!.splits![0]!.id).toBe(split1.id);
    });
  });
});
