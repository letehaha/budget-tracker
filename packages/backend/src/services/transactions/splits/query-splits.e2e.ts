import { describe, expect, it } from 'vitest';
import * as helpers from '@tests/helpers';

describe('Query transactions with splits', () => {
  describe('includeSplits parameter', () => {
    it('should return splits when includeSplits is true', async () => {
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

      expect(transactions).toHaveLength(1);
      expect(transactions![0]!.splits).toBeDefined();
      expect(transactions![0]!.splits).toHaveLength(1);
      expect(transactions![0]!.splits![0]!.categoryId).toBe(categories[1]!.id);
    });

    it('should not return splits when includeSplits is false', async () => {
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
        includeSplits: false,
      });

      expect(transactions).toHaveLength(1);
      expect(transactions![0]!.splits).toBeUndefined();
    });

    it('should not return splits by default (includeSplits omitted)', async () => {
      const account = await helpers.createAccount({ raw: true });
      const categories = await helpers.getCategoriesList();

      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        categoryId: categories[0]!.id,
        amount: 1000,
        splits: [{ categoryId: categories[1]!.id, amount: 400 }],
      });

      await helpers.createTransaction({ payload: txPayload, raw: false });

      const transactions = await helpers.getTransactions({ raw: true });

      expect(transactions).toHaveLength(1);
      expect(transactions![0]!.splits).toBeUndefined();
    });
  });

  describe('categoryIds filter with splits', () => {
    it('should find transaction by split category', async () => {
      const account = await helpers.createAccount({ raw: true });
      const categories = await helpers.getCategoriesList();

      // Create transaction with primary category A and split category B
      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        categoryId: categories[0]!.id, // primary category
        amount: 1000,
        splits: [{ categoryId: categories[1]!.id, amount: 400 }], // split category
      });

      await helpers.createTransaction({ payload: txPayload, raw: false });

      // Filter by split category should find the transaction
      const transactions = await helpers.getTransactions({
        raw: true,
        categoryIds: [categories[1]!.id],
        includeSplits: true,
      });

      expect(transactions).toHaveLength(1);
      expect(transactions![0]!.categoryId).toBe(categories[0]!.id);
      expect(transactions![0]!.splits![0]!.categoryId).toBe(categories[1]!.id);
    });

    it('should find transaction by primary category', async () => {
      const account = await helpers.createAccount({ raw: true });
      const categories = await helpers.getCategoriesList();

      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        categoryId: categories[0]!.id,
        amount: 1000,
        splits: [{ categoryId: categories[1]!.id, amount: 400 }],
      });

      await helpers.createTransaction({ payload: txPayload, raw: false });

      // Filter by primary category should find the transaction
      const transactions = await helpers.getTransactions({
        raw: true,
        categoryIds: [categories[0]!.id],
        includeSplits: true,
      });

      expect(transactions).toHaveLength(1);
      expect(transactions![0]!.categoryId).toBe(categories[0]!.id);
    });

    it('should not duplicate transaction when filtering by both primary and split category', async () => {
      const account = await helpers.createAccount({ raw: true });
      const categories = await helpers.getCategoriesList();

      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        categoryId: categories[0]!.id,
        amount: 1000,
        splits: [{ categoryId: categories[1]!.id, amount: 400 }],
      });

      await helpers.createTransaction({ payload: txPayload, raw: false });

      // Filter by both primary and split category - should return only once
      const transactions = await helpers.getTransactions({
        raw: true,
        categoryIds: [categories[0]!.id, categories[1]!.id],
        includeSplits: true,
      });

      expect(transactions).toHaveLength(1);
    });
  });

  describe('Transaction deletion with splits', () => {
    it('should cascade delete splits when transaction is deleted', async () => {
      const account = await helpers.createAccount({ raw: true });
      const categories = await helpers.getCategoriesList();

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

      const transactions = await helpers.getTransactions({
        raw: true,
        includeSplits: true,
      });

      expect(transactions![0]!.splits).toHaveLength(2);
      const txId = transactions![0]!.id;

      // Delete the transaction
      const deleteRes = await helpers.deleteTransaction({ id: txId });
      expect(deleteRes.statusCode).toBe(200);

      // Verify transaction and splits are gone
      const remaining = await helpers.getTransactions({
        raw: true,
        includeSplits: true,
      });

      expect(remaining).toHaveLength(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle exactly 10 splits (maximum allowed)', async () => {
      const account = await helpers.createAccount({ raw: true });
      const categories = await helpers.getCategoriesList();

      // Need at least 11 categories (1 primary + 10 splits)
      const splitCategories = categories.slice(1, 11);
      expect(splitCategories.length).toBe(10);

      const splits = splitCategories.map((cat, index) => ({
        categoryId: cat!.id,
        amount: 50 + index, // 50, 51, 52... to make them unique and total < 1000
      }));

      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        categoryId: categories[0]!.id,
        amount: 1000,
        splits,
      });

      const createRes = await helpers.createTransaction({
        payload: txPayload,
        raw: false,
      });

      expect(createRes.statusCode).toBe(200);

      const transactions = await helpers.getTransactions({
        raw: true,
        includeSplits: true,
      });

      expect(transactions![0]!.splits).toHaveLength(10);
    });

    it('should include split category details when requested', async () => {
      const account = await helpers.createAccount({ raw: true });
      const categories = await helpers.getCategoriesList();

      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        categoryId: categories[0]!.id,
        amount: 1000,
        splits: [{ categoryId: categories[1]!.id, amount: 400, note: 'Split note' }],
      });

      await helpers.createTransaction({ payload: txPayload, raw: false });

      const transactions = await helpers.getTransactions({
        raw: true,
        includeSplits: true,
      });

      const split = transactions![0]!.splits![0]!;
      expect(split.categoryId).toBe(categories[1]!.id);
      expect(split.amount).toBe(400);
      expect(split.note).toBe('Split note');
      // Category details should be nested
      expect(split.category).toBeDefined();
      expect(split.category!.id).toBe(categories[1]!.id);
    });

    it('should work with other filters combined', async () => {
      const account = await helpers.createAccount({ raw: true });
      const categories = await helpers.getCategoriesList();

      const txPayload = helpers.buildTransactionPayload({
        accountId: account.id,
        categoryId: categories[0]!.id,
        amount: 500,
        splits: [{ categoryId: categories[1]!.id, amount: 200 }],
      });

      await helpers.createTransaction({ payload: txPayload, raw: false });

      // Combine multiple filters with includeSplits
      const transactions = await helpers.getTransactions({
        raw: true,
        includeSplits: true,
        accountIds: [account.id],
        amountGte: 100,
        amountLte: 1000,
      });

      expect(transactions).toHaveLength(1);
      expect(transactions![0]!.splits).toHaveLength(1);
    });
  });
});
