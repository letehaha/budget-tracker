import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Update transaction with splits', () => {
  it('should add splits to existing transaction without splits', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();

    // Create transaction without splits
    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: categories[0]!.id,
      amount: 1000,
    });

    await helpers.createTransaction({ payload: txPayload, raw: false });

    const transactions = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    const txId = transactions![0]!.id;
    expect(transactions![0]!.splits).toHaveLength(0);

    // Update to add splits
    const updateRes = await helpers.updateTransaction({
      id: txId,
      payload: {
        splits: [{ categoryId: categories[1]!.id, amount: 400 }],
      },
      raw: false,
    });

    expect(updateRes.statusCode).toBe(200);

    // Verify splits were added
    const updatedTx = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    expect(updatedTx![0]!.splits).toHaveLength(1);
    expect(updatedTx![0]!.splits![0]!.amount).toBe(400);
  });

  it('should replace existing splits with new ones', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();

    // Create transaction with initial split
    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: categories[0]!.id,
      amount: 1000,
      splits: [{ categoryId: categories[1]!.id, amount: 300 }],
    });

    await helpers.createTransaction({ payload: txPayload, raw: false });

    const transactions = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    const txId = transactions![0]!.id;
    const originalSplitId = transactions![0]!.splits![0]!.id;

    // Update with new splits
    const updateRes = await helpers.updateTransaction({
      id: txId,
      payload: {
        splits: [
          { categoryId: categories[2]!.id, amount: 200 },
          { categoryId: categories[3]!.id, amount: 150 },
        ],
      },
      raw: false,
    });

    expect(updateRes.statusCode).toBe(200);

    // Verify old split removed and new ones added
    const updatedTx = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    expect(updatedTx![0]!.splits).toHaveLength(2);
    expect(updatedTx![0]!.splits!.every((s) => s.id !== originalSplitId)).toBe(true);
  });

  it('should clear all splits when passing null', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();

    // Create transaction with splits
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

    const txId = transactions![0]!.id;
    expect(transactions![0]!.splits).toHaveLength(1);

    // Update with null to clear splits
    const updateRes = await helpers.updateTransaction({
      id: txId,
      payload: {
        splits: null,
      },
      raw: false,
    });

    expect(updateRes.statusCode).toBe(200);

    // Verify splits were cleared
    const updatedTx = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    expect(updatedTx![0]!.splits).toHaveLength(0);
  });

  it('should clear all splits when passing empty array', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();

    // Create transaction with splits
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

    const txId = transactions![0]!.id;

    // Update with empty array to clear splits
    const updateRes = await helpers.updateTransaction({
      id: txId,
      payload: {
        splits: [],
      },
      raw: false,
    });

    expect(updateRes.statusCode).toBe(200);

    // Verify splits were cleared
    const updatedTx = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    expect(updatedTx![0]!.splits).toHaveLength(0);
  });

  it('should reject splits when updating to transfer transaction', async () => {
    const accountA = await helpers.createAccount({ raw: true });
    const accountB = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();

    // Create regular transaction with splits
    const txPayload = helpers.buildTransactionPayload({
      accountId: accountA.id,
      categoryId: categories[0]!.id,
      amount: 1000,
      splits: [{ categoryId: categories[1]!.id, amount: 400 }],
    });

    await helpers.createTransaction({ payload: txPayload, raw: false });

    const transactions = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    const txId = transactions![0]!.id;

    // Try to convert to transfer while keeping splits - should be rejected
    const updateRes = await helpers.updateTransaction({
      id: txId,
      payload: {
        destinationAccountId: accountB.id,
        destinationAmount: 1000,
        splits: [{ categoryId: categories[1]!.id, amount: 400 }],
      },
      raw: false,
    });

    expect(updateRes.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should reject when updated split total exceeds transaction amount', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();

    // Create transaction
    const txPayload = helpers.buildTransactionPayload({
      accountId: account.id,
      categoryId: categories[0]!.id,
      amount: 1000,
    });

    await helpers.createTransaction({ payload: txPayload, raw: false });

    const transactions = await helpers.getTransactions({ raw: true });
    const txId = transactions![0]!.id;

    // Try to add splits exceeding amount
    const updateRes = await helpers.updateTransaction({
      id: txId,
      payload: {
        splits: [
          { categoryId: categories[1]!.id, amount: 600 },
          { categoryId: categories[2]!.id, amount: 600 },
        ],
      },
      raw: false,
    });

    expect(updateRes.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('should preserve splits when updating other transaction fields', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();

    // Create transaction with splits
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

    const txId = transactions![0]!.id;
    const originalSplitId = transactions![0]!.splits![0]!.id;

    // Update note only (not splits)
    const updateRes = await helpers.updateTransaction({
      id: txId,
      payload: {
        note: 'Updated note',
      },
      raw: false,
    });

    expect(updateRes.statusCode).toBe(200);

    // Verify splits are preserved
    const updatedTx = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    expect(updatedTx![0]!.splits).toHaveLength(1);
    expect(updatedTx![0]!.splits![0]!.id).toBe(originalSplitId);
  });

  it('should update split amounts when transaction amount changes', async () => {
    const account = await helpers.createAccount({ raw: true });
    const categories = await helpers.getCategoriesList();

    // Create transaction with splits
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

    const txId = transactions![0]!.id;

    // Update amount and splits together
    const updateRes = await helpers.updateTransaction({
      id: txId,
      payload: {
        amount: 2000,
        splits: [{ categoryId: categories[1]!.id, amount: 800 }],
      },
      raw: false,
    });

    expect(updateRes.statusCode).toBe(200);

    const updatedTx = await helpers.getTransactions({
      raw: true,
      includeSplits: true,
    });

    expect(updatedTx![0]!.amount).toBe(2000);
    expect(updatedTx![0]!.splits![0]!.amount).toBe(800);
  });
});
