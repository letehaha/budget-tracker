import { CATEGORIZATION_MODE, CATEGORIZATION_SOURCE, type RecordId } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

async function createCustomCategory({ name }: { name: string }) {
  return helpers.addCustomCategory({ name: `${name} ${Date.now()}`, color: '#FF0000', raw: true });
}

/**
 * A transaction stamped by something other than the user, so a later edit can be checked
 * for both restamping and leaving the stamp alone. An `enforce` Payee both sets the
 * category and writes `categorizationMeta.source = payee_rule`.
 */
async function seedStampedTransaction({
  accountId,
  categoryId,
  name,
}: {
  accountId: RecordId;
  categoryId: RecordId;
  name: string;
}): Promise<string> {
  const payee = await helpers.createPayee({
    payload: {
      name: `${name} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      defaultCategoryId: categoryId,
      categorizationMode: CATEGORIZATION_MODE.enforce,
    },
    raw: true,
  });

  const [transaction] = await helpers.createTransaction({
    payload: helpers.buildTransactionPayload({
      accountId,
      categoryId: global.DEFAULT_CATEGORY_ID,
      payeeId: payee.id,
    }),
    raw: true,
  });

  const stamped = await helpers.getTransactionById({ id: transaction.id, raw: true });
  expect(stamped?.categoryId).toBe(categoryId);
  expect(stamped?.categorizationMeta?.source).toBe(CATEGORIZATION_SOURCE.payeeRule);

  return transaction.id;
}

const readMeta = async ({ id }: { id: string }) =>
  (await helpers.getTransactionById({ id, raw: true }))?.categorizationMeta;

const candidateIds = async () => (await helpers.getAiCategorizationCandidates({ raw: true })).items.map((tx) => tx.id);

describe('Manual category change stamping', () => {
  describe('PUT /transactions/:id', () => {
    it('stamps a manual source when the category actually changes', async () => {
      const account = await helpers.createAccount({ raw: true });
      const category = await createCustomCategory({ name: 'Groceries' });
      const [transaction] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });

      expect(await readMeta({ id: transaction.id })).toBeNull();

      await helpers.updateTransaction({
        id: transaction.id as RecordId,
        payload: { categoryId: category.id },
        raw: true,
      });

      const meta = await readMeta({ id: transaction.id });
      expect(meta?.source).toBe(CATEGORIZATION_SOURCE.manual);
      expect(Number.isNaN(Date.parse(meta!.categorizedAt!))).toBe(false);
    });

    it('clears the stamp when the category moves back to the default one', async () => {
      // `global.DEFAULT_CATEGORY_ID` is just the first seeded category, not the user's
      // uncategorized default — only the latter makes the service clear the stamp.
      const user = await helpers.getUserInfo({ raw: true });
      const account = await helpers.createAccount({ raw: true });
      const category = await createCustomCategory({ name: 'Groceries' });
      const transactionId = await seedStampedTransaction({
        accountId: account.id,
        categoryId: category.id,
        name: 'Enforced Merchant',
      });

      expect(await candidateIds()).not.toContain(transactionId);

      await helpers.updateTransaction({
        id: transactionId as RecordId,
        payload: { categoryId: user.defaultCategoryId as RecordId },
        raw: true,
      });

      expect(await readMeta({ id: transactionId })).toBeNull();
      expect(await candidateIds()).toContain(transactionId);
    });

    it('leaves the stamp alone when the update does not touch the category', async () => {
      const account = await helpers.createAccount({ raw: true });
      const category = await createCustomCategory({ name: 'Groceries' });
      const transactionId = await seedStampedTransaction({
        accountId: account.id,
        categoryId: category.id,
        name: 'Enforced Merchant',
      });

      await helpers.updateTransaction({
        id: transactionId as RecordId,
        payload: { note: 'Renamed by the user' },
        raw: true,
      });

      expect((await readMeta({ id: transactionId }))?.source).toBe(CATEGORIZATION_SOURCE.payeeRule);
    });

    it('leaves the stamp alone when the same category is sent again', async () => {
      const account = await helpers.createAccount({ raw: true });
      const category = await createCustomCategory({ name: 'Groceries' });
      const transactionId = await seedStampedTransaction({
        accountId: account.id,
        categoryId: category.id,
        name: 'Enforced Merchant',
      });

      await helpers.updateTransaction({
        id: transactionId as RecordId,
        payload: { categoryId: category.id },
        raw: true,
      });

      expect((await readMeta({ id: transactionId }))?.source).toBe(CATEGORIZATION_SOURCE.payeeRule);
    });
  });

  describe('PUT /transactions/bulk', () => {
    it('stamps a manual source on every row whose category changes', async () => {
      const account = await helpers.createAccount({ raw: true });
      const category = await createCustomCategory({ name: 'Groceries' });

      const [first] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });
      const [second] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });

      await helpers.bulkUpdateTransactions({
        payload: { transactionIds: [first.id, second.id], categoryId: category.id },
        raw: true,
      });

      for (const id of [first.id, second.id]) {
        const meta = await readMeta({ id });
        expect(meta?.source).toBe(CATEGORIZATION_SOURCE.manual);
        expect(Number.isNaN(Date.parse(meta!.categorizedAt!))).toBe(false);
      }
    });

    it('clears the stamp when the rows move back to the default category', async () => {
      const user = await helpers.getUserInfo({ raw: true });
      const account = await helpers.createAccount({ raw: true });
      const category = await createCustomCategory({ name: 'Groceries' });

      const first = await seedStampedTransaction({
        accountId: account.id,
        categoryId: category.id,
        name: 'Enforced One',
      });
      const second = await seedStampedTransaction({
        accountId: account.id,
        categoryId: category.id,
        name: 'Enforced Two',
      });

      await helpers.bulkUpdateTransactions({
        payload: { transactionIds: [first, second], categoryId: user.defaultCategoryId as RecordId },
        raw: true,
      });

      expect(await readMeta({ id: first })).toBeNull();
      expect(await readMeta({ id: second })).toBeNull();

      const candidates = await candidateIds();
      expect(candidates).toContain(first);
      expect(candidates).toContain(second);
    });

    it('leaves the stamp alone on a note-only bulk update', async () => {
      const account = await helpers.createAccount({ raw: true });
      const category = await createCustomCategory({ name: 'Groceries' });
      const transactionId = await seedStampedTransaction({
        accountId: account.id,
        categoryId: category.id,
        name: 'Enforced Merchant',
      });

      await helpers.bulkUpdateTransactions({
        payload: { transactionIds: [transactionId], note: 'Renamed in bulk' },
        raw: true,
      });

      expect((await readMeta({ id: transactionId }))?.source).toBe(CATEGORIZATION_SOURCE.payeeRule);
    });

    it('only restamps the rows that were not already in the target category', async () => {
      const account = await helpers.createAccount({ raw: true });
      const category = await createCustomCategory({ name: 'Groceries' });

      const alreadyThere = await seedStampedTransaction({
        accountId: account.id,
        categoryId: category.id,
        name: 'Enforced Merchant',
      });
      const [moving] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id }),
        raw: true,
      });

      await helpers.bulkUpdateTransactions({
        payload: { transactionIds: [alreadyThere, moving.id], categoryId: category.id },
        raw: true,
      });

      expect((await readMeta({ id: alreadyThere }))?.source).toBe(CATEGORIZATION_SOURCE.payeeRule);
      expect((await readMeta({ id: moving.id }))?.source).toBe(CATEGORIZATION_SOURCE.manual);
    });
  });
});
