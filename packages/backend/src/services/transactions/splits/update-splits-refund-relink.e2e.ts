import { type RecordId, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

/**
 * Updating a transaction replaces every split row, so refunds that targeted the old splits
 * must be re-pointed at the new ones. A lost link silently downgrades a split-level refund
 * to a transaction-level one, which moves the refunded money onto the transaction's primary
 * category in the stats breakdowns and drops the per-split over-refund ceiling.
 */
describe('Split-targeted refunds across transaction updates', () => {
  const TX_AMOUNT = 10000;

  const getFirstSplit = async ({ transactionId }: { transactionId: string }) => {
    const transactions = await helpers.getTransactions({ raw: true, includeSplits: true });
    return transactions!.find((tx) => tx.id === transactionId)!.splits![0]!;
  };

  /** $100 expense on the primary category with a split carved out for a second category. */
  const createSplitExpense = async ({ splitAmount }: { splitAmount: number }) => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();
    const primaryCategory = categories[0]!;
    const splitCategory = categories[1]!;
    const spareCategory = categories[2]!;

    const [expenseTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        categoryId: primaryCategory.id,
        amount: TX_AMOUNT,
        transactionType: TRANSACTION_TYPES.expense,
        splits: [{ categoryId: splitCategory.id, amount: splitAmount }],
      }),
      raw: true,
    });

    const split = await getFirstSplit({ transactionId: expenseTx.id });

    return { account, primaryCategory, splitCategory, spareCategory, expenseTx, split };
  };

  const refundSplit = async ({
    accountId,
    categoryId,
    amount,
    originalTxId,
    splitId,
  }: {
    accountId: RecordId;
    categoryId: RecordId;
    amount: number;
    originalTxId: RecordId;
    splitId: RecordId;
  }) => {
    const [refundTx] = await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId,
        categoryId,
        amount,
        transactionType: TRANSACTION_TYPES.income,
      }),
      raw: true,
    });

    const response = await helpers.createSingleRefund({ originalTxId, refundTxId: refundTx.id, splitId });

    return { refundTx, response };
  };

  it('re-points the refund at the recreated split and keeps its stats attribution after an update', async () => {
    const { account, primaryCategory, splitCategory, expenseTx, split } = await createSplitExpense({
      splitAmount: 4000,
    });

    const { refundTx } = await refundSplit({
      accountId: account.id,
      categoryId: splitCategory.id,
      amount: 4000,
      originalTxId: expenseTx.id,
      splitId: split.id,
    });

    // Editing an unrelated field still re-sends the splits, which recreates the rows
    const updateRes = await helpers.updateTransaction({
      id: expenseTx.id,
      payload: {
        note: 'Updated note',
        splits: [{ categoryId: splitCategory.id, amount: 4000 }],
      },
      raw: false,
    });
    expect(updateRes.statusCode).toBe(200);

    const newSplit = await getFirstSplit({ transactionId: expenseTx.id });
    expect(newSplit.id).not.toBe(split.id);

    const refundLink = await helpers.getSingleRefund({ originalTxId: expenseTx.id, refundTxId: refundTx.id }, true);
    expect(refundLink.splitId).toBe(newSplit.id);

    const stats = await helpers.getSpendingsByCategories({ raw: true });

    // Primary: 10000 - 4000 split = 6000, untouched by a refund that targets the split
    expect(stats[primaryCategory.id].amount).toBe(6000);
    // Split: 4000 - 4000 refund = 0
    expect(stats[splitCategory.id].amount).toBe(0);
  });

  it('still enforces the per-split refund ceiling after the update', async () => {
    const { account, splitCategory, expenseTx, split } = await createSplitExpense({ splitAmount: 4000 });

    await refundSplit({
      accountId: account.id,
      categoryId: splitCategory.id,
      amount: 2500,
      originalTxId: expenseTx.id,
      splitId: split.id,
    });

    await helpers.updateTransaction({
      id: expenseTx.id,
      payload: { splits: [{ categoryId: splitCategory.id, amount: 4000 }] },
      raw: false,
    });

    const newSplit = await getFirstSplit({ transactionId: expenseTx.id });

    // 2500 already refunded + 2500 exceeds the 4000 split
    const { response } = await refundSplit({
      accountId: account.id,
      categoryId: splitCategory.id,
      amount: 2500,
      originalTxId: expenseTx.id,
      splitId: newSplit.id,
    });

    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('moves the refund to transaction level when its category is dropped from the update', async () => {
    const { account, primaryCategory, splitCategory, spareCategory, expenseTx, split } = await createSplitExpense({
      splitAmount: 4000,
    });

    const { refundTx } = await refundSplit({
      accountId: account.id,
      categoryId: splitCategory.id,
      amount: 4000,
      originalTxId: expenseTx.id,
      splitId: split.id,
    });

    await helpers.updateTransaction({
      id: expenseTx.id,
      payload: { splits: [{ categoryId: spareCategory.id, amount: 4000 }] },
      raw: false,
    });

    const refundLink = await helpers.getSingleRefund({ originalTxId: expenseTx.id, refundTxId: refundTx.id }, true);
    expect(refundLink.splitId).toBeNull();

    const stats = await helpers.getSpendingsByCategories({ raw: true });

    // Primary: 6000 after the split, minus the now transaction-level 4000 refund
    expect(stats[primaryCategory.id].amount).toBe(2000);
    expect(stats[spareCategory.id].amount).toBe(4000);
    expect(stats[splitCategory.id]).toBeUndefined();
  });

  it('moves the refund to transaction level when all splits are cleared', async () => {
    const { account, primaryCategory, splitCategory, expenseTx, split } = await createSplitExpense({
      splitAmount: 4000,
    });

    const { refundTx } = await refundSplit({
      accountId: account.id,
      categoryId: splitCategory.id,
      amount: 4000,
      originalTxId: expenseTx.id,
      splitId: split.id,
    });

    await helpers.updateTransaction({ id: expenseTx.id, payload: { splits: [] }, raw: false });

    const refundLink = await helpers.getSingleRefund({ originalTxId: expenseTx.id, refundTxId: refundTx.id }, true);
    expect(refundLink.splitId).toBeNull();

    const stats = await helpers.getSpendingsByCategories({ raw: true });

    // Whole 10000 back on the primary category, minus the 4000 refund
    expect(stats[primaryCategory.id].amount).toBe(6000);
    expect(stats[splitCategory.id]).toBeUndefined();
  });
});
