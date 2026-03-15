import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Bulk update transactions controller', () => {
  describe('category updates', () => {
    it('should bulk update category for multiple transactions', async () => {
      const account = await helpers.createAccount({ raw: true });
      const newCategory = await helpers.addCustomCategory({ name: 'Test Category', color: '#FF0000', raw: true });

      // Create transactions with default categoryId (1)
      const [tx1] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });
      const [tx2] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });

      const result = await helpers.bulkUpdateTransactions({
        payload: {
          transactionIds: [tx1.id, tx2.id],
          categoryId: newCategory.id,
        },
        raw: true,
      });

      expect(result.updatedCount).toBe(2);
      expect(result.updatedIds).toContain(tx1.id);
      expect(result.updatedIds).toContain(tx2.id);

      const transactions = (await helpers.getTransactions({ raw: true }))!;
      const updatedTx1 = transactions.find((t) => t.id === tx1.id);
      const updatedTx2 = transactions.find((t) => t.id === tx2.id);

      expect(updatedTx1?.categoryId).toBe(newCategory.id);
      expect(updatedTx2?.categoryId).toBe(newCategory.id);
    });

    it('should skip transfer transactions when updating category', async () => {
      const accountA = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({ raw: true });
      const newCategory = await helpers.addCustomCategory({ name: 'Test Category', color: '#00FF00', raw: true });

      // Create a regular transaction with default categoryId
      const [regularTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: accountA.id }),
        raw: true,
      });

      // Create a transfer transaction
      const [transferTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: accountA.id,
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAccountId: accountB.id,
          destinationAmount: 1000,
        }),
        raw: true,
      });

      const result = await helpers.bulkUpdateTransactions({
        payload: {
          transactionIds: [regularTx.id, transferTx.id],
          categoryId: newCategory.id,
        },
        raw: true,
      });

      // Only the regular transaction should be updated
      expect(result.updatedCount).toBe(1);
      expect(result.updatedIds).toContain(regularTx.id);
      expect(result.updatedIds).not.toContain(transferTx.id);
    });
  });

  describe('tag updates', () => {
    it('should add tags to transactions and update updatedAt', async () => {
      const account = await helpers.createAccount({ raw: true });
      const tag = await helpers.createTag({ payload: helpers.buildTagPayload(), raw: true });

      const [tx1] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });
      const [tx2] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });

      const originalUpdatedAt1 = tx1.updatedAt;
      const originalUpdatedAt2 = tx2.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await helpers.bulkUpdateTransactions({
        payload: {
          transactionIds: [tx1.id, tx2.id],
          tagIds: [tag.id],
          tagMode: 'add',
        },
        raw: true,
      });

      expect(result.updatedCount).toBe(2);

      const transactions = (await helpers.getTransactions({ includeTags: true, raw: true }))!;
      const updatedTx1 = transactions.find((t) => t.id === tx1.id);
      const updatedTx2 = transactions.find((t) => t.id === tx2.id);

      // Verify tags were added
      expect(updatedTx1?.tags).toHaveLength(1);
      expect(updatedTx1?.tags?.[0]?.id).toBe(tag.id);
      expect(updatedTx2?.tags).toHaveLength(1);
      expect(updatedTx2?.tags?.[0]?.id).toBe(tag.id);

      // Verify updatedAt was changed
      expect(new Date(updatedTx1!.updatedAt).getTime()).toBeGreaterThan(new Date(originalUpdatedAt1).getTime());
      expect(new Date(updatedTx2!.updatedAt).getTime()).toBeGreaterThan(new Date(originalUpdatedAt2).getTime());
    });

    it('should replace tags on transactions and update updatedAt', async () => {
      const account = await helpers.createAccount({ raw: true });
      const tag1 = await helpers.createTag({ payload: helpers.buildTagPayload({ name: 'Tag 1' }), raw: true });
      const tag2 = await helpers.createTag({ payload: helpers.buildTagPayload({ name: 'Tag 2' }), raw: true });

      // Create transaction without tags first
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });

      // Add initial tag via bulk update
      await helpers.bulkUpdateTransactions({
        payload: {
          transactionIds: [tx.id],
          tagIds: [tag1.id],
          tagMode: 'add',
        },
        raw: true,
      });

      // Get updated transaction to capture new updatedAt
      let transactions = (await helpers.getTransactions({ includeTags: true, raw: true }))!;
      const txWithTag = transactions.find((t) => t.id === tx.id);
      const originalUpdatedAt = txWithTag!.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Now replace with tag2
      await helpers.bulkUpdateTransactions({
        payload: {
          transactionIds: [tx.id],
          tagIds: [tag2.id],
          tagMode: 'replace',
        },
        raw: true,
      });

      transactions = (await helpers.getTransactions({ includeTags: true, raw: true }))!;
      const updatedTx = transactions.find((t) => t.id === tx.id);

      // Verify tags were replaced
      expect(updatedTx?.tags).toHaveLength(1);
      expect(updatedTx?.tags?.[0]?.id).toBe(tag2.id);

      // Verify updatedAt was changed
      expect(new Date(updatedTx!.updatedAt).getTime()).toBeGreaterThan(new Date(originalUpdatedAt).getTime());
    });

    it('should remove tags from transactions and update updatedAt', async () => {
      const account = await helpers.createAccount({ raw: true });
      const tag1 = await helpers.createTag({ payload: helpers.buildTagPayload({ name: 'Tag 1' }), raw: true });
      const tag2 = await helpers.createTag({ payload: helpers.buildTagPayload({ name: 'Tag 2' }), raw: true });

      // Create transaction without tags first
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });

      // Add both tags via bulk update
      await helpers.bulkUpdateTransactions({
        payload: {
          transactionIds: [tx.id],
          tagIds: [tag1.id, tag2.id],
          tagMode: 'add',
        },
        raw: true,
      });

      // Get updated transaction to capture new updatedAt
      let transactions = (await helpers.getTransactions({ includeTags: true, raw: true }))!;
      const txWithTags = transactions.find((t) => t.id === tx.id);
      const originalUpdatedAt = txWithTags!.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Now remove tag1
      await helpers.bulkUpdateTransactions({
        payload: {
          transactionIds: [tx.id],
          tagIds: [tag1.id],
          tagMode: 'remove',
        },
        raw: true,
      });

      transactions = (await helpers.getTransactions({ includeTags: true, raw: true }))!;
      const updatedTx = transactions.find((t) => t.id === tx.id);

      // Verify only tag2 remains
      expect(updatedTx?.tags).toHaveLength(1);
      expect(updatedTx?.tags?.[0]?.id).toBe(tag2.id);

      // Verify updatedAt was changed
      expect(new Date(updatedTx!.updatedAt).getTime()).toBeGreaterThan(new Date(originalUpdatedAt).getTime());
    });
  });

  describe('note updates', () => {
    it('should bulk update note for transactions', async () => {
      const account = await helpers.createAccount({ raw: true });

      const [tx1] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });
      const [tx2] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });

      const newNote = 'Bulk updated note';
      const result = await helpers.bulkUpdateTransactions({
        payload: {
          transactionIds: [tx1.id, tx2.id],
          note: newNote,
        },
        raw: true,
      });

      expect(result.updatedCount).toBe(2);

      const transactions = (await helpers.getTransactions({ raw: true }))!;
      const updatedTx1 = transactions.find((t) => t.id === tx1.id);
      const updatedTx2 = transactions.find((t) => t.id === tx2.id);

      expect(updatedTx1?.note).toBe(newNote);
      expect(updatedTx2?.note).toBe(newNote);
    });
  });

  describe('validation', () => {
    it('should fail when no update fields are provided', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });

      const result = await helpers.bulkUpdateTransactions({
        payload: {
          transactionIds: [tx.id],
        },
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should fail when transaction IDs array is empty', async () => {
      const category = await helpers.addCustomCategory({ name: 'Test Category', color: '#0000FF', raw: true });

      const result = await helpers.bulkUpdateTransactions({
        payload: {
          transactionIds: [],
          categoryId: category.id,
        },
      });

      expect(result.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should fail when category does not exist', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });

      const result = await helpers.bulkUpdateTransactions({
        payload: {
          transactionIds: [tx.id],
          categoryId: 999999,
        },
      });

      expect(result.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('should fail when no valid transactions found', async () => {
      const category = await helpers.addCustomCategory({ name: 'Test Category', color: '#FFFF00', raw: true });

      const result = await helpers.bulkUpdateTransactions({
        payload: {
          transactionIds: [999999],
          categoryId: category.id,
        },
      });

      expect(result.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });
});
