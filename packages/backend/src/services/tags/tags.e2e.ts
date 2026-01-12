import { TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Tags API', () => {
  describe('POST /tags (createTag)', () => {
    it('successfully creates a tag', async () => {
      const payload = helpers.buildTagPayload({ name: 'Groceries', color: '#10b981' });
      const tag = await helpers.createTag({ payload, raw: true });

      expect(tag.id).toBeDefined();
      expect(tag.name).toBe('Groceries');
      expect(tag.color).toBe('#10b981');
      expect(tag.icon).toBeNull();
      expect(tag.description).toBeNull();
    });

    it('creates a tag with icon and description', async () => {
      const payload = helpers.buildTagPayload({
        name: 'Entertainment',
        color: '#8b5cf6',
        icon: 'film',
        description: 'Movies, games, and fun activities',
      });
      const tag = await helpers.createTag({ payload, raw: true });

      expect(tag.name).toBe('Entertainment');
      expect(tag.icon).toBe('film');
      expect(tag.description).toBe('Movies, games, and fun activities');
    });

    it('allows creating multiple tags with different names', async () => {
      const tag1 = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Tag One' }),
        raw: true,
      });
      const tag2 = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Tag Two' }),
        raw: true,
      });

      expect(tag1.id).toBeDefined();
      expect(tag2.id).toBeDefined();
      expect(tag1.id).not.toBe(tag2.id);
    });

    it('fails to create a tag without required fields', async () => {
      const response = await helpers.createTag({
        payload: { name: '', color: '' } as helpers.CreateTagPayload,
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('GET /tags (getTags)', () => {
    it('returns all tags for the user', async () => {
      await helpers.createTag({ payload: helpers.buildTagPayload({ name: 'Tag A' }), raw: true });
      await helpers.createTag({ payload: helpers.buildTagPayload({ name: 'Tag B' }), raw: true });

      const tags = await helpers.getTags({ raw: true });

      expect(tags.length).toBeGreaterThanOrEqual(2);
      expect(tags.some((t) => t.name === 'Tag A')).toBe(true);
      expect(tags.some((t) => t.name === 'Tag B')).toBe(true);
    });
  });

  describe('GET /tags/:id (getTagById)', () => {
    it('returns a specific tag by ID', async () => {
      const created = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Specific Tag' }),
        raw: true,
      });

      const tag = await helpers.getTagById({ id: created.id, raw: true });

      expect(tag.id).toBe(created.id);
      expect(tag.name).toBe('Specific Tag');
    });

    it('returns 404 for non-existent tag', async () => {
      const response = await helpers.getTagById({ id: 999999, raw: false });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('PUT /tags/:id (updateTag)', () => {
    it('updates tag properties', async () => {
      const created = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Original Name' }),
        raw: true,
      });

      const updated = await helpers.updateTag({
        id: created.id,
        payload: { name: 'Updated Name', color: '#ef4444', icon: 'star' },
        raw: true,
      });

      expect(updated.id).toBe(created.id);
      expect(updated.name).toBe('Updated Name');
      expect(updated.color).toBe('#ef4444');
      expect(updated.icon).toBe('star');
    });

    it('can update only specific fields', async () => {
      const created = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Partial Update', color: '#3b82f6' }),
        raw: true,
      });

      const updated = await helpers.updateTag({
        id: created.id,
        payload: { description: 'New description' },
        raw: true,
      });

      expect(updated.name).toBe('Partial Update');
      expect(updated.color).toBe('#3b82f6');
      expect(updated.description).toBe('New description');
    });

    it('returns 404 for non-existent tag', async () => {
      const response = await helpers.updateTag({
        id: 999999,
        payload: { name: 'Does not exist' },
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('DELETE /tags/:id (deleteTag)', () => {
    it('deletes an existing tag', async () => {
      const created = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'To Delete' }),
        raw: true,
      });

      const deleteResponse = await helpers.deleteTag({ id: created.id, raw: false });
      expect(deleteResponse.statusCode).toBe(200);

      const getResponse = await helpers.getTagById({ id: created.id, raw: false });
      expect(getResponse.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('returns 404 for non-existent tag', async () => {
      const response = await helpers.deleteTag({ id: 999999, raw: false });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('POST /tags/:id/transactions (addTransactionsToTag)', () => {
    it('adds transactions to a tag', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [[tx1], [tx2]] = await Promise.all([
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
            amount: 200,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          raw: true,
        }),
      ]);

      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Shopping' }),
        raw: true,
      });

      const result = await helpers.addTransactionsToTag({
        tagId: tag.id,
        transactionIds: [tx1.id, tx2.id],
        raw: true,
      });

      expect(result.addedCount).toBe(2);
      expect(result.skippedCount).toBe(0);
    });

    it('skips already-tagged transactions', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Skip Test' }),
        raw: true,
      });

      // Add once
      await helpers.addTransactionsToTag({
        tagId: tag.id,
        transactionIds: [tx.id],
        raw: true,
      });

      // Try to add again
      const result = await helpers.addTransactionsToTag({
        tagId: tag.id,
        transactionIds: [tx.id],
        raw: true,
      });

      expect(result.addedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
    });
  });

  describe('DELETE /tags/:id/transactions (removeTransactionsFromTag)', () => {
    it('removes transactions from a tag', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Remove Test' }),
        raw: true,
      });

      await helpers.addTransactionsToTag({
        tagId: tag.id,
        transactionIds: [tx.id],
        raw: true,
      });

      const result = await helpers.removeTransactionsFromTag({
        tagId: tag.id,
        transactionIds: [tx.id],
        raw: true,
      });

      expect(result.removedCount).toBe(1);
    });

    it('handles removing non-linked transactions gracefully', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const tag = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Not Linked' }),
        raw: true,
      });

      // Try to remove without adding first
      const result = await helpers.removeTransactionsFromTag({
        tagId: tag.id,
        transactionIds: [tx.id],
        raw: true,
      });

      expect(result.removedCount).toBe(0);
    });
  });
});
