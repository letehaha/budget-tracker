/**
 * Shared budget visibility — recipient's read-only view of owner budgets.
 *
 * Covers GET /budgets (list) and GET /budgets/:id (detail) access control,
 * stats parity between owner and recipient, and the share block shape.
 *
 * See `docs/prds/family-sharing-budgets.md` Phase 5 — Visibility tests.
 */

import { ACCESS_SOURCES, BUDGET_TYPES, RESOURCE_TYPES, SHARE_PERMISSIONS, TRANSACTION_TYPES } from '@bt/shared/types';
import { NONEXISTENT_ID } from '@common/lib/record-id-helpers';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { CustomResponse } from '@tests/helpers/common';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Shared test scaffold helpers
// ---------------------------------------------------------------------------

interface RecipientHandle extends helpers.SecondUserHandle {}

async function provisionRecipient(): Promise<RecipientHandle> {
  const handle = await helpers.signUpSecondUser();
  await helpers.asUser({
    cookies: handle.cookies,
    fn: async () => {
      const res = await helpers.setBaseCurrencyForActiveUser({ currencyCode: global.BASE_CURRENCY.code });
      if (res.statusCode !== 200) {
        throw new Error(`Failed to set base currency: ${res.statusCode} ${JSON.stringify(res.body)}`);
      }
    },
  });
  return handle;
}

interface ShareBudgetParams {
  budgetId: string;
  recipient: RecipientHandle;
  permission: (typeof SHARE_PERMISSIONS)[keyof typeof SHARE_PERMISSIONS];
}

/** Owner shares a budget and the recipient auto-accepts. Requires owner cookies in `global.APP_AUTH_COOKIES`. */
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

describe('Shared budget visibility', () => {
  describe('GET /budgets — list', () => {
    it("returns owner's own budgets with share.isOwner=true and accessSource='owner'", async () => {
      const budget = await helpers.createCustomBudget({
        name: 'Owner budget',
        raw: true,
      });

      const budgets = await helpers.getCustomBudgets({ raw: true });
      const found = (budgets as Array<{ id: string; share?: { isOwner: boolean; accessSource: string } }>).find(
        (b) => b.id === budget.id,
      );
      expect(found).toBeDefined();
      expect(found!.share).toBeDefined();
      expect(found!.share!.isOwner).toBe(true);
      expect(found!.share!.accessSource).toBe(ACCESS_SOURCES.owner);
    });

    it("includes owner's shared budget in recipient's budget list", async () => {
      const budget = await helpers.createCustomBudget({
        name: 'Shared to recipient',
        raw: true,
      });
      const recipient = await provisionRecipient();
      await shareBudget({ budgetId: budget.id, recipient, permission: SHARE_PERMISSIONS.read });

      const budgets = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getCustomBudgets({ raw: true }),
      });

      type BudgetListItem = {
        id: string;
        share?: {
          isOwner: boolean;
          accessSource: string;
          permission: string;
          owner: { username: string };
        };
      };

      const found = (budgets as BudgetListItem[]).find((b) => b.id === budget.id);
      expect(found).toBeDefined();
      expect(found!.share).toBeDefined();
      expect(found!.share!.isOwner).toBe(false);
      expect(found!.share!.accessSource).toBe(ACCESS_SOURCES.share);
      expect(found!.share!.permission).toBe(SHARE_PERMISSIONS.read);
      expect(found!.share!.owner.username).toBeTruthy();
    });

    it("does not include budget in a non-recipient's list", async () => {
      const budget = await helpers.createCustomBudget({
        name: 'Private budget',
        raw: true,
      });
      const stranger = await provisionRecipient();

      const budgets = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () => helpers.getCustomBudgets({ raw: true }),
      });

      expect((budgets as Array<{ id: string }>).find((b) => b.id === budget.id)).toBeUndefined();
    });
  });

  describe('GET /budgets/:id — detail', () => {
    it('returns 404 for a non-recipient accessing the budget by id', async () => {
      const budget = await helpers.createCustomBudget({ name: 'Owner-only', raw: true });
      const stranger = await provisionRecipient();

      const res = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () => helpers.getCustomBudgetById({ id: budget.id, raw: false }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('returns the shared budget to a recipient with share block (isOwner=false)', async () => {
      const budget = await helpers.createCustomBudget({ name: 'Shared detail', raw: true });
      const recipient = await provisionRecipient();
      await shareBudget({ budgetId: budget.id, recipient, permission: SHARE_PERMISSIONS.read });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getCustomBudgetById({ id: budget.id, raw: false }),
      });

      expect(res.statusCode).toBe(200);
      const body = (
        res as unknown as CustomResponse<{
          id: string;
          share?: { isOwner: boolean; permission: string; accessSource: string };
        }>
      ).body.response;
      expect(body.id).toBe(budget.id);
      expect(body.share).toBeDefined();
      expect(body.share!.isOwner).toBe(false);
      expect(body.share!.permission).toBe(SHARE_PERMISSIONS.read);
      expect(body.share!.accessSource).toBe(ACCESS_SOURCES.share);
    });

    it('returns 404 on GET /budgets/:id after share is revoked', async () => {
      const budget = await helpers.createCustomBudget({ name: 'Revoke test', raw: true });
      const recipient = await provisionRecipient();
      await shareBudget({ budgetId: budget.id, recipient, permission: SHARE_PERMISSIONS.read });

      // Confirm recipient could access before revoke
      const before = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getCustomBudgetById({ id: budget.id, raw: false }),
      });
      expect(before.statusCode).toBe(200);

      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
      await helpers.revokeShareMember({
        resourceType: RESOURCE_TYPES.budget,
        resourceId: budget.id,
        memberUserId: recipientApp.id,
        raw: true,
      });

      const after = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getCustomBudgetById({ id: budget.id, raw: false }),
      });
      expect(after.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('GET /budgets/:id/stats — stats parity', () => {
    it('returns identical stats for owner and recipient on the same budget', async () => {
      const account = await helpers.createAccount({ raw: true });

      // Create a few transactions to populate stats
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 200,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const budget = await helpers.createCustomBudget({
        name: 'Stats parity budget',
        autoInclude: true,
        limitAmount: 1000,
        raw: true,
      });

      const recipient = await provisionRecipient();
      await shareBudget({ budgetId: budget.id, recipient, permission: SHARE_PERMISSIONS.read });

      const ownerStats = await helpers.getStats({ id: budget.id, raw: true });
      const recipientStats = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getStats({ id: budget.id, raw: true }),
      });

      // Both should get stats back (may be null if no transactions in budget period,
      // but the shape must match regardless)
      expect(JSON.stringify(ownerStats)).toBe(JSON.stringify(recipientStats));
    });

    it('GET /budgets/:id/spending-stats — read recipient sees the same rows as the owner', async () => {
      // Defends the controller→service auth move: spending-stats now runs auth inside
      // the service and resolves the owner's userId internally. A regression that drops
      // the owner-scope switch would silently return empty results to the recipient.
      const account = await helpers.createAccount({ raw: true });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 120,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const budget = await helpers.createCustomBudget({
        name: 'Spending-stats parity',
        autoInclude: true,
        limitAmount: 1000,
        raw: true,
      });

      const recipient = await provisionRecipient();
      await shareBudget({ budgetId: budget.id, recipient, permission: SHARE_PERMISSIONS.read });

      const ownerSpending = await helpers.getSpendingStats({ id: budget.id, raw: true });
      const recipientSpending = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getSpendingStats({ id: budget.id, raw: true }),
      });

      expect(JSON.stringify(ownerSpending)).toBe(JSON.stringify(recipientSpending));
    });

    it('GET /budgets/:id/spending-stats — stranger gets 404', async () => {
      const budget = await helpers.createCustomBudget({ name: 'Spending-stats stranger', raw: true });
      const stranger = await provisionRecipient();

      const response = (await helpers.asUser({
        cookies: stranger.cookies,
        fn: () => helpers.getSpendingStats({ id: budget.id, raw: false }),
      })) as CustomResponse<unknown>;

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('GET /budgets/:id/spending-stats — 404 for an unknown budget id', async () => {
      const response = (await helpers.getSpendingStats({
        id: NONEXISTENT_ID,
        raw: false,
      })) as CustomResponse<unknown>;

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('GET /budgets/:id/category-transactions — recipient access', () => {
    it('read recipient on a shared category budget sees the owner-scoped transactions', async () => {
      // Defends the same controller→service auth move for the category-budget
      // transaction list. Recipient must see owner-scoped txs, not their own slice.
      const category = await helpers.addCustomCategory({ name: 'Cat-shared', color: '#123456', raw: true });
      const ownerAccount = await helpers.createAccount({ raw: true });
      const [ownerTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: ownerAccount.id,
          amount: 75,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
        }),
        raw: true,
      });

      const budget = await helpers.createCustomBudget({
        name: 'Category budget shared',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        limitAmount: 500,
        raw: true,
      });

      const recipient = await provisionRecipient();
      await shareBudget({ budgetId: budget.id, recipient, permission: SHARE_PERMISSIONS.read });

      const recipientView = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getCategoryBudgetTransactions({ id: budget.id, raw: true }),
      });

      expect(recipientView.total).toBe(1);
      expect(recipientView.transactions[0]!.id).toBe(ownerTx!.id);
    });

    it('stranger calling GET /budgets/:id/category-transactions gets 404', async () => {
      const category = await helpers.addCustomCategory({ name: 'Cat-stranger', color: '#654321', raw: true });
      const budget = await helpers.createCustomBudget({
        name: 'Category budget stranger',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        limitAmount: 500,
        raw: true,
      });
      const stranger = await provisionRecipient();

      const response = (await helpers.asUser({
        cookies: stranger.cookies,
        fn: () => helpers.getCategoryBudgetTransactions({ id: budget.id, raw: false }),
      })) as CustomResponse<unknown>;

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('Household auto-grant — explicitly blocked for budgets', () => {
    it('returns 404 for a household member who has no explicit budget share', async () => {
      const budget = await helpers.createCustomBudget({ name: 'Household-no-grant', raw: true });

      const ownerApp = await helpers.findAppUserByEmail({ email: 'test1@test.local' });
      const householdMember = await provisionRecipient();

      // Grant household membership — this should NOT auto-grant budget access
      const householdInvitation = await helpers.createHouseholdInvitation({
        ownerUserId: ownerApp.id,
        inviteeEmail: householdMember.email,
        permission: SHARE_PERMISSIONS.write,
      });
      await helpers.asUser({
        cookies: householdMember.cookies,
        fn: () => helpers.acceptShareInvitation({ token: householdInvitation.token, raw: true }),
      });

      // Household member must NOT see the budget — no explicit share
      const res = await helpers.asUser({
        cookies: householdMember.cookies,
        fn: () => helpers.getCustomBudgetById({ id: budget.id, raw: false }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it("does not include owner's budget in household member's GET /budgets list without explicit share", async () => {
      const budget = await helpers.createCustomBudget({ name: 'HH-list-no-grant', raw: true });

      const ownerApp = await helpers.findAppUserByEmail({ email: 'test1@test.local' });
      const householdMember = await provisionRecipient();

      const householdInvitation = await helpers.createHouseholdInvitation({
        ownerUserId: ownerApp.id,
        inviteeEmail: householdMember.email,
        permission: SHARE_PERMISSIONS.write,
      });
      await helpers.asUser({
        cookies: householdMember.cookies,
        fn: () => helpers.acceptShareInvitation({ token: householdInvitation.token, raw: true }),
      });

      const budgets = await helpers.asUser({
        cookies: householdMember.cookies,
        fn: () => helpers.getCustomBudgets({ raw: true }),
      });

      expect((budgets as Array<{ id: string }>).find((b) => b.id === budget.id)).toBeUndefined();
    });
  });
});
