/**
 * Shared budget writes — permission-gated mutations on shared budgets.
 *
 * Covers the write-scope decisions from `docs/prds/family-sharing-budgets.md`:
 * - read recipients: all mutations return 404 (existence-mask)
 * - write recipients: tx-link only (no metadata edits), own-tx constraint, metadata stamp
 * - manage recipients: metadata edits + archive + invite; delete stays owner-only
 * - owner: can detach any row including recipient-attached ones
 *
 * See `docs/prds/family-sharing-budgets.md` Phase 5 — Writes tests.
 */

import { BUDGET_TYPES, RESOURCE_TYPES, SHARE_PERMISSIONS, TRANSACTION_TYPES } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import BudgetTransactions from '@models/budget-transactions.model';
import * as helpers from '@tests/helpers';

// ---------------------------------------------------------------------------
// Shared scaffold helpers
// ---------------------------------------------------------------------------

/**
 * Creates a recipient-owned account + category, then creates one transaction
 * belonging to that recipient. Returns the transaction so callers can use its id.
 */
async function recipientCreatesTx({ cookies }: { cookies: string }) {
  const account = await helpers.asUser({ cookies, fn: () => helpers.createAccount({ raw: true }) });
  const category = await helpers.asUser({
    cookies,
    fn: () => helpers.addCustomCategory({ name: `r-${Date.now()}-${Math.random()}`, color: '#888888', raw: true }),
  });
  const [tx] = await helpers.asUser({
    cookies,
    fn: () =>
      helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, categoryId: category.id }),
        raw: true,
      }),
  });
  return tx!;
}

interface ShareBudgetParams {
  budgetId: string;
  recipient: helpers.SecondUserHandle;
  permission: (typeof SHARE_PERMISSIONS)[keyof typeof SHARE_PERMISSIONS];
}

async function shareBudget({ budgetId, recipient, permission }: ShareBudgetParams): Promise<void> {
  const invitation = await helpers.createShareInvitation({
    inviteeEmail: recipient.email,
    resourceType: RESOURCE_TYPES.budget,
    resourceId: budgetId,
    permission,
    raw: true,
  });
  await helpers.asUser({
    cookies: recipient.cookies,
    fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Shared budget writes', () => {
  describe('read recipient — all mutations return 404', () => {
    it('returns 404 to a read recipient on metadata edit, attach, detach, archive and delete', async () => {
      const account = await helpers.createAccount({ raw: true });
      const [ownerTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 50 }),
        raw: true,
      });
      const budget = await helpers.createCustomBudget({ name: 'Read-only budget', raw: true });
      await helpers.addTransactionToCustomBudget({
        id: budget.id,
        payload: { transactionIds: [ownerTx!.id] },
        raw: true,
      });

      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      await shareBudget({ budgetId: budget.id, recipient, permission: SHARE_PERMISSIONS.read });
      const recipientTx = await recipientCreatesTx({ cookies: recipient.cookies });

      const editRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.editCustomBudget({
            id: budget.id,
            params: { name: 'Changed by recipient' },
            raw: false,
          }),
      });
      expect(editRes.statusCode).toBe(ERROR_CODES.NotFoundError);

      const attachRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.addTransactionToCustomBudget({
            id: budget.id,
            payload: { transactionIds: [recipientTx.id] },
            raw: false,
          }),
      });
      expect(attachRes.statusCode).toBe(ERROR_CODES.NotFoundError);

      const detachRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.removeTransactionFromCustomBudget({
            id: budget.id,
            payload: { transactionIds: [ownerTx!.id] },
            raw: false,
          }),
      });
      expect(detachRes.statusCode).toBe(ERROR_CODES.NotFoundError);

      const archiveRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.archiveCustomBudget({
            id: budget.id,
            isArchived: true,
            raw: false,
          }),
      });
      expect(archiveRes.statusCode).toBe(ERROR_CODES.NotFoundError);

      const deleteRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.deleteCustomBudget({ id: budget.id, raw: false }),
      });
      expect(deleteRes.statusCode).toBe(ERROR_CODES.NotFoundError);
    }, 30000);
  });

  describe('write recipient on a manual budget', () => {
    it('rejects metadata edits and archive with 404 (write grants neither)', async () => {
      const budget = await helpers.createCustomBudget({ name: 'Write no meta', raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      await shareBudget({ budgetId: budget.id, recipient, permission: SHARE_PERMISSIONS.write });

      const editRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.editCustomBudget({
            id: budget.id,
            params: { name: 'Hacked name' },
            raw: false,
          }),
      });
      expect(editRes.statusCode).toBe(ERROR_CODES.NotFoundError);

      const archiveRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.archiveCustomBudget({
            id: budget.id,
            isArchived: true,
            raw: false,
          }),
      });
      expect(archiveRes.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it("attaches and detaches the recipient's own tx → 200, metadata.addedByUserId stamped, row gone", async () => {
      const budget = await helpers.createCustomBudget({ name: 'Write attach own', raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      await shareBudget({ budgetId: budget.id, recipient, permission: SHARE_PERMISSIONS.write });

      const recipientTx = await recipientCreatesTx({ cookies: recipient.cookies });

      const attachRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.addTransactionToCustomBudget({
            id: budget.id,
            payload: { transactionIds: [recipientTx.id] },
            raw: false,
          }),
      });

      expect(attachRes.statusCode).toBe(200);

      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
      const btRow = await BudgetTransactions.findOne({
        where: { budgetId: budget.id, transactionId: recipientTx.id },
      });
      expect(btRow).not.toBeNull();
      expect(btRow!.metadata).not.toBeNull();
      expect(btRow!.metadata!.addedByUserId).toBe(recipientApp.id);

      const detachRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.removeTransactionFromCustomBudget({
            id: budget.id,
            payload: { transactionIds: [recipientTx.id] },
            raw: false,
          }),
      });

      expect(detachRes.statusCode).toBe(200);

      const afterRow = await BudgetTransactions.findOne({
        where: { budgetId: budget.id, transactionId: recipientTx.id },
      });
      expect(afterRow).toBeNull();
    }, 30000);

    it("rejects attaching an owner's tx (alone or mixed with own) and silently ignores detaching one", async () => {
      const account = await helpers.createAccount({ raw: true });
      const [ownerTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100 }),
        raw: true,
      });
      const budget = await helpers.createCustomBudget({ name: 'Write owner tx reject', raw: true });
      await helpers.addTransactionToCustomBudget({
        id: budget.id,
        payload: { transactionIds: [ownerTx!.id] },
        raw: true,
      });

      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      await shareBudget({ budgetId: budget.id, recipient, permission: SHARE_PERMISSIONS.write });
      const recipientTx = await recipientCreatesTx({ cookies: recipient.cookies });

      const ownerOnlyRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.addTransactionToCustomBudget({
            id: budget.id,
            payload: { transactionIds: [ownerTx!.id] },
            raw: false,
          }),
      });
      expect(ownerOnlyRes.statusCode).toBe(ERROR_CODES.ValidationError);

      const mixedRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.addTransactionToCustomBudget({
            id: budget.id,
            payload: { transactionIds: [recipientTx.id, ownerTx!.id] },
            raw: false,
          }),
      });
      expect(mixedRes.statusCode).toBe(ERROR_CODES.ValidationError);

      // The service silently ignores rows not matching the JSONB filter and returns 200
      const detachRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.removeTransactionFromCustomBudget({
            id: budget.id,
            payload: { transactionIds: [ownerTx!.id] },
            raw: false,
          }),
      });
      expect(detachRes.statusCode).toBe(200);

      // Row must still be present — the JSONB filter excluded it from the destroy
      const afterRow = await BudgetTransactions.findOne({
        where: { budgetId: budget.id, transactionId: ownerTx!.id },
      });
      expect(afterRow).not.toBeNull();
    }, 30000);

    it("POST tx with own tx whose category is NOT in budget's category list → 200 (no category check on manual attach)", async () => {
      // Budget has a category list (via category ids). A manual budget does NOT enforce
      // that attached transactions match the category list — that's auto-include scope only.
      const ownerCategory = await helpers.addCustomCategory({
        name: 'Owner cat for budget',
        color: '#FF0000',
        raw: true,
      });
      const budget = await helpers.createCustomBudget({
        name: 'Write cat mismatch allowed',
        categoryIds: [ownerCategory.id],
        raw: true,
      });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      await shareBudget({ budgetId: budget.id, recipient, permission: SHARE_PERMISSIONS.write });

      // Recipient creates a tx using their own (different) category — not in budget's list
      const recipientCategory = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.addCustomCategory({ name: 'Recipient cat', color: '#0000FF', raw: true }),
      });
      const recipientAccount = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.createAccount({ raw: true }),
      });
      const [recipientTx] = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.createTransaction({
            payload: helpers.buildTransactionPayload({
              accountId: recipientAccount.id,
              amount: 50,
              transactionType: TRANSACTION_TYPES.expense,
              categoryId: recipientCategory.id,
            }),
            raw: true,
          }),
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.addTransactionToCustomBudget({
            id: budget.id,
            payload: { transactionIds: [recipientTx!.id] },
            raw: false,
          }),
      });

      // No category-match check on manual budgets — should succeed
      expect(res.statusCode).toBe(200);
    });
  });

  describe('write recipient on a category-type budget', () => {
    it('POST /budgets/:id/transactions → 400 cannotManuallyLinkToCategoryBudget', async () => {
      const category = await helpers.addCustomCategory({
        name: 'Cat budget cat',
        color: '#123456',
        raw: true,
      });
      const budget = await helpers.createCustomBudget({
        name: 'Category budget',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        raw: true,
      });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      await shareBudget({ budgetId: budget.id, recipient, permission: SHARE_PERMISSIONS.write });

      const recipientTx = await recipientCreatesTx({ cookies: recipient.cookies });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.addTransactionToCustomBudget({
            id: budget.id,
            payload: { transactionIds: [recipientTx.id] },
            raw: false,
          }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('manage recipient', () => {
    it('allows metadata edits and archive but not invitations or budget deletion', async () => {
      const budget = await helpers.createCustomBudget({ name: 'Manage meta', raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      await shareBudget({ budgetId: budget.id, recipient, permission: SHARE_PERMISSIONS.manage });
      const thirdUser = await helpers.provisionSecondUserWithBaseCurrency();

      const editRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.editCustomBudget({
            id: budget.id,
            params: { name: 'Manage renamed' },
            raw: false,
          }),
      });
      expect(editRes.statusCode).toBe(200);

      const inviteRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.createShareInvitation({
            inviteeEmail: thirdUser.email,
            resourceType: RESOURCE_TYPES.budget,
            resourceId: budget.id,
            permission: SHARE_PERMISSIONS.read,
          }),
      });
      expect(inviteRes.statusCode).toBe(ERROR_CODES.NotFoundError);

      const deleteRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.deleteCustomBudget({ id: budget.id, raw: false }),
      });
      expect(deleteRes.statusCode).toBe(ERROR_CODES.NotFoundError);

      const archiveRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.archiveCustomBudget({
            id: budget.id,
            isArchived: true,
            raw: false,
          }),
      });
      expect(archiveRes.statusCode).toBe(200);
    }, 30000);
  });

  describe('direct PUT/DELETE on a tx visible only via budget share', () => {
    // Setup: owner creates a private account + tx, attaches it to a budget, then shares
    // the BUDGET (not the account) with the recipient. The recipient sees the row in the
    // budget list and may try to edit/delete it directly. They have no claim on the
    // parent account → no write access. Before this fix the API returned 404
    // "transaction doesn't exist", which surfaced as a confusing error in the UI.
    const setup = async ({
      permission,
    }: {
      permission: (typeof SHARE_PERMISSIONS)[keyof typeof SHARE_PERMISSIONS];
    }) => {
      const account = await helpers.createAccount({ raw: true });
      const [ownerTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 75 }),
        raw: true,
      });
      const budget = await helpers.createCustomBudget({ name: `direct-${permission}`, raw: true });
      await helpers.addTransactionToCustomBudget({
        id: budget.id,
        payload: { transactionIds: [ownerTx!.id] },
        raw: true,
      });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      await shareBudget({ budgetId: budget.id, recipient, permission });
      return { ownerTx: ownerTx!, recipient };
    };

    it('PUT /transactions/:id → 403 for a write-permission budget recipient on owner tx', async () => {
      const { ownerTx, recipient } = await setup({ permission: SHARE_PERMISSIONS.write });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.updateTransaction({ id: ownerTx.id, payload: { amount: 200 } }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.Forbidden);
    });

    it('returns 403 to a manage-permission budget recipient on PUT and DELETE of an owner tx, 404 for a missing tx', async () => {
      const { ownerTx, recipient } = await setup({ permission: SHARE_PERMISSIONS.manage });

      const updateRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.updateTransaction({ id: ownerTx.id, payload: { amount: 200 } }),
      });
      expect(updateRes.statusCode).toBe(ERROR_CODES.Forbidden);

      const deleteRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.deleteTransaction({ id: ownerTx.id }),
      });
      expect(deleteRes.statusCode).toBe(ERROR_CODES.Forbidden);

      const missingRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.updateTransaction({ id: generateRandomRecordId(), payload: { amount: 1 } }),
      });
      expect(missingRes.statusCode).toBe(ERROR_CODES.NotFoundError);
    }, 30000);

    it('PUT /transactions/:id → 200 when recipient edits their own attached tx (sanity check)', async () => {
      const budget = await helpers.createCustomBudget({ name: 'own edit ok', raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      await shareBudget({ budgetId: budget.id, recipient, permission: SHARE_PERMISSIONS.write });

      const recipientTx = await recipientCreatesTx({ cookies: recipient.cookies });
      await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.addTransactionToCustomBudget({
            id: budget.id,
            payload: { transactionIds: [recipientTx.id] },
            raw: true,
          }),
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.updateTransaction({ id: recipientTx.id, payload: { amount: 999 } }),
      });

      expect(res.statusCode).toBe(200);
    });
  });

  describe('owner detaches recipient-attached row', () => {
    it('owner can detach a row that a write recipient attached → 200, row gone', async () => {
      const budget = await helpers.createCustomBudget({ name: 'Owner detach recipient row', raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      await shareBudget({ budgetId: budget.id, recipient, permission: SHARE_PERMISSIONS.write });

      const recipientTx = await recipientCreatesTx({ cookies: recipient.cookies });
      // Recipient attaches
      await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.addTransactionToCustomBudget({
            id: budget.id,
            payload: { transactionIds: [recipientTx.id] },
            raw: true,
          }),
      });

      // Confirm row exists with metadata set
      const beforeRow = await BudgetTransactions.findOne({
        where: { budgetId: budget.id, transactionId: recipientTx.id },
      });
      expect(beforeRow).not.toBeNull();
      expect(beforeRow!.metadata).not.toBeNull();

      // Owner detaches (as owner — no metadata restriction)
      const res = await helpers.removeTransactionFromCustomBudget({
        id: budget.id,
        payload: { transactionIds: [recipientTx.id] },
        raw: false,
      });

      expect(res.statusCode).toBe(200);

      const afterRow = await BudgetTransactions.findOne({
        where: { budgetId: budget.id, transactionId: recipientTx.id },
      });
      expect(afterRow).toBeNull();
    });
  });
});
