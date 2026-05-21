/**
 * Shared budget visibility — recipient's read-only view of owner budgets.
 *
 * Covers GET /budgets (list) and GET /budgets/:id (detail) access control,
 * stats parity between owner and recipient, and the share block shape.
 *
 * See `docs/prds/family-sharing-budgets.md` Phase 5 — Visibility tests.
 */

import { ACCESS_SOURCES, RESOURCE_TYPES, SHARE_PERMISSIONS, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { CustomResponse } from '@tests/helpers/common';

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
