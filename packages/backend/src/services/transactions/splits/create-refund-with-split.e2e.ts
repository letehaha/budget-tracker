import { TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

/**
 * Tests for creating a transaction that refunds a specific split
 * using the refundForTxId and refundForSplitId parameters during creation.
 */
describe('Create transaction that refunds a specific split', () => {
  it('should create a refund transaction targeting a specific split', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();
    const foodCategory = categories[0]!;
    const shoppingCategory = categories[1]!;

    // 1. Create expense with split: $100 total = $60 food (primary) + $40 shopping (split)
    const expensePayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: foodCategory.id,
      amount: 10000, // $100.00 in cents
      transactionType: TRANSACTION_TYPES.expense,
      splits: [{ categoryId: shoppingCategory.id, amount: 4000 }], // $40 to shopping
    });

    await helpers.createTransaction({
      payload: expensePayload,
      raw: false,
    });

    // Get the expense transaction with splits
    const expenseTransactions = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    expect(expenseTransactions).toHaveLength(1);
    const expenseTx = expenseTransactions![0]!;
    expect(expenseTx.splits).toHaveLength(1);
    const shoppingSplit = expenseTx.splits![0]!;

    // 2. Create income transaction that refunds the shopping split
    // Using refundForTxId and refundForSplitId during creation
    const refundPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: shoppingCategory.id,
      amount: 4000, // $40.00 refund for the shopping split
      transactionType: TRANSACTION_TYPES.income, // Opposite type
      refundForTxId: expenseTx.id,
      refundForSplitId: shoppingSplit.id,
    });

    const [refundTx] = await helpers.createTransaction({
      payload: refundPayload,
      raw: true,
    });

    expect(refundTx).toBeDefined();

    // 3. Verify the refund link was created
    const refundLink = await helpers.getSingleRefund(
      {
        originalTxId: expenseTx.id,
        refundTxId: refundTx.id,
      },
      true,
    );

    expect(refundLink).toBeDefined();
    expect(refundLink.splitId).toBe(shoppingSplit.id);
  });

  it('should reject refund amount greater than split amount', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();
    const foodCategory = categories[0]!;
    const shoppingCategory = categories[1]!;

    // Create expense with split: $100 total = $60 food (primary) + $40 shopping (split)
    const expensePayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: foodCategory.id,
      amount: 10000,
      transactionType: TRANSACTION_TYPES.expense,
      splits: [{ categoryId: shoppingCategory.id, amount: 4000 }],
    });

    await helpers.createTransaction({ payload: expensePayload, raw: false });

    const expenseTransactions = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });
    const expenseTx = expenseTransactions![0]!;
    const shoppingSplit = expenseTx.splits![0]!;

    // Try to refund $50 for a $40 split - should fail
    const refundPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: shoppingCategory.id,
      amount: 5000, // $50 > $40 split amount
      transactionType: TRANSACTION_TYPES.income,
      refundForTxId: expenseTx.id,
      refundForSplitId: shoppingSplit.id,
    });

    const refundResponse = await helpers.createTransaction({
      payload: refundPayload,
      raw: false,
    });

    expect(refundResponse.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should reject refundForSplitId without refundForTxId', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();

    const refundPayload = {
      ...helpers.buildTransactionPayload({
        accountId: account.id,
        categoryId: categories[0]!.id,
        amount: 4000,
        transactionType: TRANSACTION_TYPES.income,
      }),
      refundForSplitId: '11111111-1111-1111-1111-111111111111', // splitId without txId
    };

    const refundResponse = await helpers.createTransaction({
      payload: refundPayload,
      raw: false,
    });

    expect(refundResponse.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should create partial refund for a split', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();
    const foodCategory = categories[0]!;
    const shoppingCategory = categories[1]!;

    // Create expense with split: $100 total = $60 food + $40 shopping
    const expensePayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: foodCategory.id,
      amount: 10000,
      transactionType: TRANSACTION_TYPES.expense,
      splits: [{ categoryId: shoppingCategory.id, amount: 4000 }],
    });

    await helpers.createTransaction({ payload: expensePayload, raw: false });

    const expenseTransactions = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });
    const expenseTx = expenseTransactions![0]!;
    const shoppingSplit = expenseTx.splits![0]!;

    // First partial refund: $20 of the $40 split
    const refund1Payload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: shoppingCategory.id,
      amount: 2000, // $20
      transactionType: TRANSACTION_TYPES.income,
      refundForTxId: expenseTx.id,
      refundForSplitId: shoppingSplit.id,
    });

    const refund1Response = await helpers.createTransaction({
      payload: refund1Payload,
      raw: false,
    });

    expect(refund1Response.statusCode).toBe(200);

    // Second partial refund: another $20 of the $40 split (total now $40)
    const refund2Payload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: shoppingCategory.id,
      amount: 2000, // $20
      transactionType: TRANSACTION_TYPES.income,
      refundForTxId: expenseTx.id,
      refundForSplitId: shoppingSplit.id,
    });

    const refund2Response = await helpers.createTransaction({
      payload: refund2Payload,
      raw: false,
    });

    expect(refund2Response.statusCode).toBe(200);

    // Third refund should fail - would exceed split amount
    const refund3Payload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: shoppingCategory.id,
      amount: 100, // $1 - would exceed the $40 limit
      transactionType: TRANSACTION_TYPES.income,
      refundForTxId: expenseTx.id,
      refundForSplitId: shoppingSplit.id,
    });

    const refund3Response = await helpers.createTransaction({
      payload: refund3Payload,
      raw: false,
    });

    expect(refund3Response.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should reject refund with non-existent splitId', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();
    const foodCategory = categories[0]!;
    const shoppingCategory = categories[1]!;

    // Create expense with split
    const expensePayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: foodCategory.id,
      amount: 10000,
      transactionType: TRANSACTION_TYPES.expense,
      splits: [{ categoryId: shoppingCategory.id, amount: 4000 }],
    });

    await helpers.createTransaction({ payload: expensePayload, raw: false });

    const expenseTransactions = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });
    const expenseTx = expenseTransactions![0]!;

    // Try to refund with non-existent split UUID
    const refundPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: shoppingCategory.id,
      amount: 4000,
      transactionType: TRANSACTION_TYPES.income,
      refundForTxId: expenseTx.id,
      refundForSplitId: '00000000-0000-0000-0000-000000000000', // Non-existent UUID
    });

    const refundResponse = await helpers.createTransaction({
      payload: refundPayload,
      raw: false,
    });

    expect(refundResponse.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  it('should reject splitId that does not belong to the originalTxId', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();
    const foodCategory = categories[0]!;
    const shoppingCategory = categories[1]!;

    // Create first expense with split
    const expense1Payload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: foodCategory.id,
      amount: 10000,
      transactionType: TRANSACTION_TYPES.expense,
      splits: [{ categoryId: shoppingCategory.id, amount: 4000 }],
    });

    await helpers.createTransaction({ payload: expense1Payload, raw: false });

    // Create second expense with split
    const expense2Payload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: foodCategory.id,
      amount: 5000,
      transactionType: TRANSACTION_TYPES.expense,
      splits: [{ categoryId: shoppingCategory.id, amount: 2000 }],
    });

    await helpers.createTransaction({ payload: expense2Payload, raw: false });

    const transactions = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    // Get tx1 and split from tx2
    const tx1 = transactions!.find((t) => t.amount === 10000)!;
    const tx2 = transactions!.find((t) => t.amount === 5000)!;
    const splitFromTx2 = tx2.splits![0]!;

    // Try to refund tx1 but with splitId from tx2 - should fail
    const refundPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: shoppingCategory.id,
      amount: 2000,
      transactionType: TRANSACTION_TYPES.income,
      refundForTxId: tx1.id,
      refundForSplitId: splitFromTx2.id, // This split belongs to tx2, not tx1
    });

    const refundResponse = await helpers.createTransaction({
      payload: refundPayload,
      raw: false,
    });

    expect(refundResponse.statusCode).toBe(ERROR_CODES.ValidationError);
  });
});
