import { TRANSACTION_TYPES } from '@bt/shared/types';
import { getTranslatedDefaultTags } from '@common/const/default-tags';
import { NONEXISTENT_ID } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Tags API', () => {
  it('returns 404 for a non-existent tag on get, update and delete', async () => {
    const getResponse = await helpers.getTagById({ id: NONEXISTENT_ID, raw: false });
    expect(getResponse.statusCode).toBe(ERROR_CODES.NotFoundError);

    const updateResponse = await helpers.updateTag({
      id: NONEXISTENT_ID,
      payload: { name: 'Does not exist' },
      raw: false,
    });
    expect(updateResponse.statusCode).toBe(ERROR_CODES.NotFoundError);

    const deleteResponse = await helpers.deleteTag({ id: NONEXISTENT_ID, raw: false });
    expect(deleteResponse.statusCode).toBe(ERROR_CODES.NotFoundError);
  });

  describe('POST /tags (createTag)', () => {
    it('creates distinct tags, defaulting icon and description to null', async () => {
      const groceries = await helpers.createTag({
        payload: helpers.buildTagPayload({ name: 'Groceries', color: '#10b981' }),
        raw: true,
      });

      expect(groceries.id).toBeDefined();
      expect(groceries.name).toBe('Groceries');
      expect(groceries.color).toBe('#10b981');
      expect(groceries.icon).toBeNull();
      expect(groceries.description).toBeNull();

      const entertainment = await helpers.createTag({
        payload: helpers.buildTagPayload({
          name: 'Entertainment',
          color: '#8b5cf6',
          icon: 'film',
          description: 'Movies, games, and fun activities',
        }),
        raw: true,
      });

      expect(entertainment.name).toBe('Entertainment');
      expect(entertainment.icon).toBe('film');
      expect(entertainment.description).toBe('Movies, games, and fun activities');
      expect(entertainment.id).toBeDefined();
      expect(entertainment.id).not.toBe(groceries.id);
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

      // fresh users are seeded with default tags, so the list is seeds + created
      expect(tags.filter((t) => ['Tag A', 'Tag B'].includes(t.name))).toHaveLength(2);
      expect(tags).toHaveLength(getTranslatedDefaultTags({ locale: 'en' }).length + 2);
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
  });

  describe('POST & DELETE /tags/:id/transactions (add/removeTransactionsToTag)', () => {
    it('adds transactions, skips already-tagged ones, removes them and ignores unlinked ones', async () => {
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

      const added = await helpers.addTransactionsToTag({
        tagId: tag.id,
        transactionIds: [tx1.id, tx2.id],
        raw: true,
      });
      expect(added.addedCount).toBe(2);
      expect(added.skippedCount).toBe(0);

      const addedAgain = await helpers.addTransactionsToTag({
        tagId: tag.id,
        transactionIds: [tx1.id, tx2.id],
        raw: true,
      });
      expect(addedAgain.addedCount).toBe(0);
      expect(addedAgain.skippedCount).toBe(2);

      const removed = await helpers.removeTransactionsFromTag({
        tagId: tag.id,
        transactionIds: [tx1.id],
        raw: true,
      });
      expect(removed.removedCount).toBe(1);

      const removedAgain = await helpers.removeTransactionsFromTag({
        tagId: tag.id,
        transactionIds: [tx1.id],
        raw: true,
      });
      expect(removedAgain.removedCount).toBe(0);
    });
  });
});
