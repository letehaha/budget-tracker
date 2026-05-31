/**
 * Budget share invitations — happy path, validation errors, currency guard,
 * idempotent accept, decline, and GET /share/shared-with-me.
 *
 * See `docs/prds/family-sharing-budgets.md` Phase 5 — Invitations tests.
 */

import { ACCESS_SOURCES, RESOURCE_TYPES, SHARE_INVITATION_STATUSES, SHARE_PERMISSIONS } from '@bt/shared/types';
import { NONEXISTENT_ID } from '@common/lib/record-id-helpers';
import ResourceShares from '@models/resource-shares.model';
import ShareInvitations from '@models/share-invitations.model';
import UsersCurrencies from '@models/users-currencies.model';
import * as helpers from '@tests/helpers';
import type { ErrorResponse } from '@tests/helpers/common';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Scaffold helpers
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

/**
 * Force-set a user's base currency directly via DB mutation (mirrors the pattern
 * in accept-decline-invitation.service.e2e.ts). Used to provoke currency mismatch.
 */
async function forceUserBaseCurrency({ userId, currencyCode }: { userId: number; currencyCode: string }) {
  await UsersCurrencies.update({ isDefaultCurrency: false }, { where: { userId } });
  const existing = await UsersCurrencies.findOne({ where: { userId, currencyCode } });
  if (existing) {
    await UsersCurrencies.update({ isDefaultCurrency: true }, { where: { userId, currencyCode } });
  } else {
    await UsersCurrencies.create({
      userId,
      currencyCode,
      isDefaultCurrency: true,
      liveRateUpdate: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Budget share invitations', () => {
  describe('happy path', () => {
    it('POST /share/invitations with resourceType=budget returns 201 invitation row', async () => {
      const budget = await helpers.createCustomBudget({ name: 'Invite happy', raw: true });
      const recipient = await provisionRecipient();

      const res = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.budget,
        resourceId: budget.id,
        permission: SHARE_PERMISSIONS.read,
      });

      expect(res.statusCode).toBe(201);
      const invitation = res.body.response;
      expect(invitation.status).toBe(SHARE_INVITATION_STATUSES.pending);
      expect(invitation.permission).toBe(SHARE_PERMISSIONS.read);
      expect(invitation.resourceType).toBe(RESOURCE_TYPES.budget);
      expect(invitation.token).toBeTruthy();
    });

    it('recipient accepts invitation → ResourceShares row created, invitation marked accepted', async () => {
      const budget = await helpers.createCustomBudget({ name: 'Accept happy', raw: true });
      const recipient = await provisionRecipient();

      const invitation = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.budget,
        resourceId: budget.id,
        permission: SHARE_PERMISSIONS.read,
        raw: true,
      });

      const acceptRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: false }),
      });
      expect(acceptRes.statusCode).toBe(200);

      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
      const shareRow = await ResourceShares.findOne({
        where: {
          resourceType: RESOURCE_TYPES.budget,
          resourceId: budget.id,
          sharedWithUserId: recipientApp.id,
        },
      });
      expect(shareRow).not.toBeNull();
      expect(shareRow!.acceptedAt).not.toBeNull();
    });
  });

  describe('validation errors', () => {
    it('returns 404 when budget does not exist', async () => {
      const recipient = await provisionRecipient();

      const res = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.budget,
        resourceId: NONEXISTENT_ID,
        permission: SHARE_PERMISSIONS.read,
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 404 when budget is owned by someone else (no leak)', async () => {
      const budget = await helpers.createCustomBudget({ name: 'Not owner budget', raw: true });

      const otherUser = await provisionRecipient();
      const thirdUser = await provisionRecipient();

      const res = await helpers.asUser({
        cookies: otherUser.cookies,
        fn: () =>
          helpers.createShareInvitation({
            inviteeEmail: thirdUser.email,
            resourceType: RESOURCE_TYPES.budget,
            resourceId: budget.id,
            permission: SHARE_PERMISSIONS.read,
          }),
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 422 when inviting yourself', async () => {
      const budget = await helpers.createCustomBudget({ name: 'Self invite', raw: true });

      const res = await helpers.createShareInvitation({
        inviteeEmail: 'test1@test.local',
        resourceType: RESOURCE_TYPES.budget,
        resourceId: budget.id,
        permission: SHARE_PERMISSIONS.read,
      });

      expect(res.statusCode).toBe(422);
      expect((res.body.response as unknown as ErrorResponse).message).toMatch(/yourself/i);
    });
  });

  describe('currency mismatch', () => {
    it('returns 422 on accept when owner and recipient base currencies differ', async () => {
      const budget = await helpers.createCustomBudget({ name: 'Currency mismatch budget', raw: true });
      const recipient = await provisionRecipient();

      const invitation = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.budget,
        resourceId: budget.id,
        permission: SHARE_PERMISSIONS.read,
        raw: true,
      });

      // Force recipient to a different base currency (EUR vs the owner's base)
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
      await forceUserBaseCurrency({ userId: recipientApp.id, currencyCode: 'EUR' });

      const acceptRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: false }),
      });

      expect(acceptRes.statusCode).toBe(422);
    });
  });

  describe('idempotent accept', () => {
    it('second accept returns 409 conflict but does not create a duplicate ResourceShares row', async () => {
      const budget = await helpers.createCustomBudget({ name: 'Idempotent accept', raw: true });
      const recipient = await provisionRecipient();

      const invitation = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.budget,
        resourceId: budget.id,
        permission: SHARE_PERMISSIONS.read,
        raw: true,
      });

      // First accept
      const first = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: false }),
      });
      expect(first.statusCode).toBe(200);

      // Second accept — invitation is already accepted, service throws ConflictError (409)
      const second = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: false }),
      });
      expect(second.statusCode).toBe(409);

      // Only one ResourceShares row must exist — no duplicate was created
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
      const shareCount = await ResourceShares.count({
        where: {
          resourceType: RESOURCE_TYPES.budget,
          resourceId: budget.id,
          sharedWithUserId: recipientApp.id,
        },
      });
      expect(shareCount).toBe(1);
    });
  });

  describe('decline', () => {
    it('declining marks the invitation declined', async () => {
      const budget = await helpers.createCustomBudget({ name: 'Decline test', raw: true });
      const recipient = await provisionRecipient();

      const invitation = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.budget,
        resourceId: budget.id,
        permission: SHARE_PERMISSIONS.read,
        raw: true,
      });

      const declineRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.declineShareInvitation({ token: invitation.token, raw: false }),
      });
      expect(declineRes.statusCode).toBe(200);

      // The list endpoint filters to pending-only, so verify status via direct DB lookup.
      const invitationAfter = await ShareInvitations.findByPk(invitation.id);
      expect(invitationAfter).not.toBeNull();
      expect(invitationAfter!.status).toBe(SHARE_INVITATION_STATUSES.declined);
    });
  });

  describe('GET /share/shared-with-me', () => {
    it('includes the accepted budget share with correct shape', async () => {
      const budget = await helpers.createCustomBudget({ name: 'Shared with me budget', raw: true });
      const recipient = await provisionRecipient();

      const invitation = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.budget,
        resourceId: budget.id,
        permission: SHARE_PERMISSIONS.read,
        raw: true,
      });
      await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
      });

      const items = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.listSharedWithMe({ raw: true }),
      });

      const found = (
        items as Array<{
          resourceId: string;
          resourceType: string;
          resourceName: string | null;
          permission: string;
          accessSource: string;
          owner: { username: string };
        }>
      ).find((i) => i.resourceId === budget.id);

      expect(found).toBeDefined();
      expect(found!.resourceType).toBe(RESOURCE_TYPES.budget);
      expect(found!.resourceName).toBe(budget.name);
      expect(found!.permission).toBe(SHARE_PERMISSIONS.read);
      expect(found!.accessSource).toBe(ACCESS_SOURCES.share);
      expect(found!.owner.username).toBeTruthy();
    });
  });
});
