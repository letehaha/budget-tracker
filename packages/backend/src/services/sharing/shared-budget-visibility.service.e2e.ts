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
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { CustomResponse } from '@tests/helpers/common';
import { addDays } from 'date-fns';

// ---------------------------------------------------------------------------
// Shared test scaffold helpers
// ---------------------------------------------------------------------------

interface ShareBudgetParams {
  budgetId: string;
  recipient: helpers.SecondUserHandle;
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
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
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
  });

  describe('no budget access', () => {
    it('hides owner budgets from a stranger across list, detail, spending-stats and category-transactions', async () => {
      const manualBudget = await helpers.createCustomBudget({ name: 'Private budget', raw: true });

      const category = await helpers.addCustomCategory({ name: 'Cat-stranger', color: '#654321', raw: true });
      const ownerAccount = await helpers.createAccount({ raw: true });
      await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: ownerAccount.id,
          amount: 75,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
        }),
        raw: true,
      });
      const categoryBudget = await helpers.createCustomBudget({
        name: 'Category budget stranger',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        limitAmount: 500,
        raw: true,
      });

      const stranger = await helpers.provisionSecondUserWithBaseCurrency();

      const budgets = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () => helpers.getCustomBudgets({ raw: true }),
      });
      const visibleIds = (budgets as Array<{ id: string }>).map((b) => b.id);
      expect(visibleIds).not.toContain(manualBudget.id);
      expect(visibleIds).not.toContain(categoryBudget.id);

      const detailRes = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () => helpers.getCustomBudgetById({ id: manualBudget.id, raw: false }),
      });
      expect(detailRes.statusCode).toBe(ERROR_CODES.NotFoundError);

      const spendingRes = (await helpers.asUser({
        cookies: stranger.cookies,
        fn: () => helpers.getSpendingStats({ id: manualBudget.id, raw: false }),
      })) as CustomResponse<unknown>;
      expect(spendingRes.statusCode).toBe(ERROR_CODES.NotFoundError);

      const categoryTxRes = (await helpers.asUser({
        cookies: stranger.cookies,
        fn: () => helpers.getCategoryBudgetTransactions({ id: categoryBudget.id, raw: false }),
      })) as CustomResponse<unknown>;
      expect(categoryTxRes.statusCode).toBe(ERROR_CODES.NotFoundError);

      const unknownIdRes = (await helpers.getSpendingStats({
        id: NONEXISTENT_ID,
        raw: false,
      })) as CustomResponse<unknown>;
      expect(unknownIdRes.statusCode).toBe(ERROR_CODES.NotFoundError);
    }, 30000);
  });

  describe('GET /budgets/:id — detail', () => {
    it('returns the shared budget to a recipient with share block (isOwner=false)', async () => {
      const budget = await helpers.createCustomBudget({ name: 'Shared detail', raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
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
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
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
    it('returns identical stats and spending-stats for owner and recipient on the same budget', async () => {
      // Both endpoints run auth inside the service and resolve the owner's userId
      // internally; dropping the owner-scope switch would silently return empty
      // results to the recipient.
      const account = await helpers.createAccount({ raw: true });

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

      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      await shareBudget({ budgetId: budget.id, recipient, permission: SHARE_PERMISSIONS.read });

      const ownerStats = await helpers.getStats({ id: budget.id, raw: true });
      const recipientStats = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getStats({ id: budget.id, raw: true }),
      });

      // Both should get stats back (may be null if no transactions in budget period,
      // but the shape must match regardless)
      expect(JSON.stringify(ownerStats)).toBe(JSON.stringify(recipientStats));

      const ownerSpending = await helpers.getSpendingStats({ id: budget.id, raw: true });
      const recipientSpending = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getSpendingStats({ id: budget.id, raw: true }),
      });

      expect(JSON.stringify(ownerSpending)).toBe(JSON.stringify(recipientSpending));
    }, 30000);
  });

  describe('GET /budgets/:id/category-transactions — recipient access', () => {
    it("keeps the owner's planned transaction out of the recipient's list and stats while the owner still counts it", async () => {
      const category = await helpers.addCustomCategory({ name: 'Cat-planned', color: '#0f0f0f', raw: true });
      const ownerAccount = await helpers.createAccount({ raw: true });

      const [realTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: ownerAccount.id,
          amount: 60,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
        }),
        raw: true,
      });
      const [plannedTx] = await helpers.createPlannedTransaction({
        payload: {
          accountId: ownerAccount.id,
          amount: 40,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: category.id,
          time: addDays(new Date(), 5).toISOString(),
        },
        raw: true,
      });

      const budget = await helpers.createCustomBudget({
        name: 'Category budget with a plan',
        type: BUDGET_TYPES.category,
        categoryIds: [category.id],
        limitAmount: 500,
        raw: true,
      });

      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      await shareBudget({ budgetId: budget.id, recipient, permission: SHARE_PERMISSIONS.read });

      const ownerView = await helpers.getCategoryBudgetTransactions({ id: budget.id, raw: true });
      expect(ownerView.total).toBe(2);
      expect(ownerView.transactions.map((tx) => tx.id).toSorted()).toEqual([realTx!.id, plannedTx!.id].toSorted());

      const recipientView = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getCategoryBudgetTransactions({ id: budget.id, raw: true }),
      });

      expect(recipientView.total).toBe(1);
      expect(recipientView.transactions.map((tx) => tx.id)).toEqual([realTx!.id]);

      const ownerStats = (await helpers.getStats({ id: budget.id, raw: true }))!;
      expect(ownerStats.summary.actualExpense).toBe(100);
      expect(ownerStats.summary.transactionsCount).toBe(2);

      const recipientStats = (await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getStats({ id: budget.id, raw: true }),
      }))!;
      expect(recipientStats.summary.actualExpense).toBe(60);
      expect(recipientStats.summary.transactionsCount).toBe(1);

      const ownerSpending = await helpers.getSpendingStats({ id: budget.id, raw: true });
      expect(ownerSpending.spendingsByCategory.find((c) => c.categoryId === category.id)?.amount).toBe(100);

      const recipientSpending = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getSpendingStats({ id: budget.id, raw: true }),
      });
      expect(recipientSpending.spendingsByCategory.find((c) => c.categoryId === category.id)?.amount).toBe(60);
    });
  });

  describe("Owner's planned rows on a shared manual budget", () => {
    it('counts the plan for the owner but keeps it out of the recipient stats and spending totals', async () => {
      const account = await helpers.createAccount({ raw: true });

      const [realTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-03-10T10:00:00Z',
        }),
        raw: true,
      });
      const [plannedTx] = await helpers.createPlannedTransaction({
        payload: {
          accountId: account.id,
          amount: 250,
          transactionType: TRANSACTION_TYPES.expense,
          time: '2025-03-20T10:00:00Z',
        },
        raw: true,
      });

      const budget = await helpers.createCustomBudget({
        name: 'Manual budget with a plan',
        startDate: '2025-03-01T00:00:00Z',
        endDate: '2025-03-31T23:59:59Z',
        limitAmount: 1000,
        raw: true,
      });
      await helpers.addTransactionToCustomBudget({
        id: budget.id,
        payload: { transactionIds: [realTx!.id, plannedTx!.id] },
      });

      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      await shareBudget({ budgetId: budget.id, recipient, permission: SHARE_PERMISSIONS.read });

      const ownerStats = (await helpers.getStats({ id: budget.id, raw: true }))!;
      expect(ownerStats.summary.actualExpense).toBe(350);
      expect(ownerStats.summary.transactionsCount).toBe(2);

      const recipientStats = (await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getStats({ id: budget.id, raw: true }),
      }))!;
      expect(recipientStats.summary.actualExpense).toBe(100);
      expect(recipientStats.summary.transactionsCount).toBe(1);

      const ownerSpending = await helpers.getSpendingStats({ id: budget.id, raw: true });
      expect(ownerSpending.spendingOverTime.periods.reduce((sum, p) => sum + p.expense, 0)).toBe(350);

      const recipientSpending = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getSpendingStats({ id: budget.id, raw: true }),
      });
      expect(recipientSpending.spendingOverTime.periods.reduce((sum, p) => sum + p.expense, 0)).toBe(100);
    });
  });

  describe('Household auto-grant — explicitly blocked for budgets', () => {
    it('returns 404 on detail and omits the budget from the list for a household member with no explicit budget share', async () => {
      const budget = await helpers.createCustomBudget({ name: 'Household-no-grant', raw: true });

      const ownerApp = await helpers.findAppUserByEmail({ email: 'test1@test.local' });
      const householdMember = await helpers.provisionSecondUserWithBaseCurrency();

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

      const res = await helpers.asUser({
        cookies: householdMember.cookies,
        fn: () => helpers.getCustomBudgetById({ id: budget.id, raw: false }),
      });

      expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);

      const budgets = await helpers.asUser({
        cookies: householdMember.cookies,
        fn: () => helpers.getCustomBudgets({ raw: true }),
      });

      expect((budgets as Array<{ id: string }>).find((b) => b.id === budget.id)).toBeUndefined();
    }, 30000);
  });

  describe('GET /categories?includeAccessible=true — budget-share scope', () => {
    it("exposes only the shared budget's referenced categories, not the owner's whole tree", async () => {
      const account = await helpers.createAccount({ raw: true });

      const referencedCategory = await helpers.addCustomCategory({
        name: 'budget-referenced-cat',
        color: '#123456',
        raw: true,
      });
      const unrelatedCategory = await helpers.addCustomCategory({
        name: 'owner-unrelated-cat',
        color: '#654321',
        raw: true,
      });

      const [ownerTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 100,
          transactionType: TRANSACTION_TYPES.expense,
          categoryId: referencedCategory.id,
        }),
        raw: true,
      });

      const budget = await helpers.createCustomBudget({
        name: 'Shared category-scope budget',
        autoInclude: false,
        limitAmount: 1000,
        raw: true,
      });
      await helpers.addTransactionToCustomBudget({
        id: budget.id,
        payload: { transactionIds: [ownerTx!.id] },
        raw: false,
      });

      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      await shareBudget({ budgetId: budget.id, recipient, permission: SHARE_PERMISSIONS.read });

      const recipientOwnCategory = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.addCustomCategory({ name: 'recipient-own-cat', color: '#00FF00', raw: true }),
      });

      const list = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getCategoriesList({ includeAccessible: true }),
      });

      // Referenced by the shared budget's tx — must resolve so the name renders.
      expect(list.find((c) => c.id === referencedCategory.id)).toBeDefined();
      // Recipient's own categories are always part of the union.
      expect(list.find((c) => c.id === recipientOwnCategory.id)).toBeDefined();
      // Owner category the shared budget never references must NOT leak.
      expect(list.find((c) => c.id === unrelatedCategory.id)).toBeUndefined();
    });
  });
});
