import {
  API_ERROR_CODES,
  RESOURCE_TYPES,
  SHARE_INVITATION_STATUSES,
  SHARE_PERMISSIONS,
  SHARING_LIMITS,
} from '@bt/shared/types';
import ResourceShares from '@models/resource-shares.model';
import ShareInvitations from '@models/share-invitations.model';
import UsersCurrencies from '@models/users-currencies.model';
import { app } from '@root/app';
import { API_PREFIX } from '@root/config';
import { Op } from '@sequelize/core';
import { generateInvitationToken } from '@services/sharing/invitations/generate-invitation-token';
import * as helpers from '@tests/helpers';
import type { ErrorResponse } from '@tests/helpers/common';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

/**
 * Force-flip a user's base currency by directly mutating UsersCurrencies. The real
 * change-base-currency flow is heavy (recalculates every transaction's refAmount under a
 * Redis lock); here we only need the recipient's recorded base to differ from the
 * resource's currency so the accept guard rejects. Used inside tests only.
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

async function setupPendingInvitation({ permission = SHARE_PERMISSIONS.read } = {}) {
  const account = await helpers.createAccount({ raw: true });
  const recipient = await helpers.provisionSecondUserWithBaseCurrency();
  const invitation = await helpers.createShareInvitation({
    inviteeEmail: recipient.email,
    resourceType: RESOURCE_TYPES.account,
    resourceId: account.id,
    permission,
    raw: true,
  });
  return { account, recipient, invitation };
}

/**
 * Phase-1-style "invite an email that doesn't exist yet, then the recipient signs up".
 * Returns the (now-resolvable) recipient handle plus the original invitation row that
 * still has `inviteeUserId = NULL`.
 */
async function setupUnresolvedInvitationThenSignUp({ permission = SHARE_PERMISSIONS.read } = {}) {
  const account = await helpers.createAccount({ raw: true });
  const futureEmail = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`;

  const invitation = await helpers.createShareInvitation({
    inviteeEmail: futureEmail,
    resourceType: RESOURCE_TYPES.account,
    resourceId: account.id,
    permission,
    raw: true,
  });
  expect(invitation.inviteeUserId).toBeNull();

  const recipient = await helpers.provisionSecondUserWithBaseCurrency({ email: futureEmail });
  return { account, recipient, invitation };
}

describe('Share invitations: accept', () => {
  describe('happy path', () => {
    it('creates a ResourceShares row and marks the invitation accepted', async () => {
      const { account, recipient, invitation } = await setupPendingInvitation();

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token }),
      });

      expect(res.statusCode).toBe(200);
      const body = res.body.response;
      expect(body.invitation.status).toBe(SHARE_INVITATION_STATUSES.accepted);
      expect(body.invitation.acceptedAt).toBeTruthy();
      expect(body.share.resourceType).toBe(RESOURCE_TYPES.account);
      expect(body.share.resourceId).toBe(String(account.id));
      expect(body.share.acceptedAt).toBeTruthy();

      const row = await ResourceShares.findOne({
        where: { resourceType: RESOURCE_TYPES.account, resourceId: String(account.id) },
      });
      expect(row).not.toBeNull();
      expect(row!.acceptedAt).not.toBeNull();
    });

    it('removes the invitation from the recipient inbox once accepted', async () => {
      const { recipient, invitation } = await setupPendingInvitation();
      await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
      });

      const inbox = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.listReceivedShareInvitations({ raw: true }),
      });
      expect(inbox).toEqual([]);
    });

    it('binds inviteeUserId on accept when the invitation was unresolved at send time', async () => {
      // Owner sent invite to an unregistered email → row.inviteeUserId is null.
      // Recipient then signed up with that exact email and can now accept it.
      const { recipient, invitation } = await setupUnresolvedInvitationThenSignUp();

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token }),
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.response.invitation.status).toBe(SHARE_INVITATION_STATUSES.accepted);

      // Stamped on accept — the invitation now points at the real user.
      const updated = await ShareInvitations.findOne({ where: { id: invitation.id } });
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
      expect(updated!.inviteeUserId).toBe(recipientApp.id);
    });
  });

  describe('error cases', () => {
    it('returns 404 when the token does not exist', async () => {
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const res = await helpers.asUser({
        cookies: recipient.cookies,
        // Well-formed but unknown token — exercises the service-level not-found path
        // rather than the controller-level length validation.
        fn: () => helpers.acceptShareInvitation({ token: 'a'.repeat(SHARING_LIMITS.invitationTokenLength) }),
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 404 when the token belongs to another user (resolved-invitee path)', async () => {
      const { invitation } = await setupPendingInvitation();
      const otherUser = await helpers.provisionSecondUserWithBaseCurrency();
      const res = await helpers.asUser({
        cookies: otherUser.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token }),
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 404 when an unresolved invite is opened by a user whose email does not match', async () => {
      const account = await helpers.createAccount({ raw: true });
      const futureEmail = `pending-${Date.now()}@test.local`;
      const invitation = await helpers.createShareInvitation({
        inviteeEmail: futureEmail,
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        permission: SHARE_PERMISSIONS.read,
        raw: true,
      });

      // Sign up a different user (different email) and try to accept.
      const wrongUser = await helpers.provisionSecondUserWithBaseCurrency();
      const res = await helpers.asUser({
        cookies: wrongUser.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token }),
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 409 when the invitation is already accepted', async () => {
      const { recipient, invitation } = await setupPendingInvitation();
      await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token }),
      });
      expect(res.statusCode).toBe(409);
      expect((res.body.response as unknown as ErrorResponse).message).toMatch(/accepted/i);
    });

    it('returns 409 when expiresAt has passed (status remains pending; cron sweeps it later)', async () => {
      const { recipient, invitation } = await setupPendingInvitation();
      await ShareInvitations.update({ expiresAt: new Date(Date.now() - 60_000) }, { where: { id: invitation.id } });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token }),
      });
      expect(res.statusCode).toBe(409);
      expect((res.body.response as unknown as ErrorResponse).message).toMatch(/expired/i);

      // Per PRD F5 the daily cron is the source of truth for marking invitations expired;
      // accept rejects without rewriting the row.
      const row = await ShareInvitations.findOne({ where: { id: invitation.id } });
      expect(row!.status).toBe(SHARE_INVITATION_STATUSES.pending);
    });

    it('serializes concurrent accepts so only one wins the last slot (advisory lock)', async () => {
      // Cap is 2. Pre-fill with 1 share so exactly 1 slot remains. Then race two
      // recipients into that slot via Promise.all. Without the advisory lock both
      // count() queries would read 1 and both inserts would succeed — exceeding the cap.
      const account = await helpers.createAccount({ raw: true });
      expect(SHARING_LIMITS.maxRecipientsPerResource).toBe(2);

      const filler = await helpers.provisionSecondUserWithBaseCurrency();
      const fillerApp = await helpers.findAppUserByEmail({ email: filler.email });
      await ResourceShares.create({
        ownerUserId: account.userId,
        sharedWithUserId: fillerApp.id,
        resourceType: RESOURCE_TYPES.account,
        resourceId: String(account.id),
        permission: SHARE_PERMISSIONS.read,
        policy: null,
        acceptedAt: new Date(),
      });

      const [racerA, racerB] = await Promise.all([
        helpers.provisionSecondUserWithBaseCurrency(),
        helpers.provisionSecondUserWithBaseCurrency(),
      ]);
      const [racerAApp, racerBApp] = await Promise.all([
        helpers.findAppUserByEmail({ email: racerA.email }),
        helpers.findAppUserByEmail({ email: racerB.email }),
      ]);

      const [invitationA, invitationB] = await Promise.all([
        ShareInvitations.create({
          ownerUserId: account.userId,
          inviteeEmail: racerA.email.toLowerCase(),
          inviteeUserId: racerAApp.id,
          resourceType: RESOURCE_TYPES.account,
          resourceId: String(account.id),
          permission: SHARE_PERMISSIONS.read,
          policy: null,
          token: generateInvitationToken(),
          status: SHARE_INVITATION_STATUSES.pending,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        }),
        ShareInvitations.create({
          ownerUserId: account.userId,
          inviteeEmail: racerB.email.toLowerCase(),
          inviteeUserId: racerBApp.id,
          resourceType: RESOURCE_TYPES.account,
          resourceId: String(account.id),
          permission: SHARE_PERMISSIONS.read,
          policy: null,
          token: generateInvitationToken(),
          status: SHARE_INVITATION_STATUSES.pending,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        }),
      ]);

      // Use raw supertest with explicit cookies — `asUser` toggles a global, which
      // doesn't survive parallel calls from different users. Each .post() reads its
      // own Cookie header before the first await, so cookies are correctly bound.
      const acceptAs = (cookies: string, token: string) =>
        request(app)
          .post(`${API_PREFIX}/share/invitations/${encodeURIComponent(token)}/accept`)
          .set('Cookie', cookies);

      const results = await Promise.all([
        acceptAs(racerA.cookies, invitationA.token),
        acceptAs(racerB.cookies, invitationB.token),
      ]);
      const statuses = results.map((r) => r.statusCode).toSorted();

      // Exactly one should win (200) and one should hit the cap (409). Without the
      // lock both would return 200 and the DB would have 3 accepted shares.
      expect(statuses).toEqual([200, 409]);

      const acceptedCount = await ResourceShares.count({
        where: {
          resourceType: RESOURCE_TYPES.account,
          resourceId: String(account.id),
          acceptedAt: { [Op.not]: null },
        },
      });
      expect(acceptedCount).toBe(SHARING_LIMITS.maxRecipientsPerResource);
    });

    it('returns 409 when the recipient cap is full (race-safe: enforced at accept-time too)', async () => {
      // Cap is 2. Pre-fill it with 2 accepted shares directly (so the slot is taken),
      // then have a 3rd recipient try to accept a real pending invitation. The send-time
      // cap check would also catch this, but we need the accept-time guard to handle the
      // case where multiple pending invites were sent before any were accepted.
      const account = await helpers.createAccount({ raw: true });
      expect(SHARING_LIMITS.maxRecipientsPerResource).toBe(2);

      for (let i = 0; i < SHARING_LIMITS.maxRecipientsPerResource; i++) {
        const filler = await helpers.provisionSecondUserWithBaseCurrency();
        const fillerApp = await helpers.findAppUserByEmail({ email: filler.email });
        await ResourceShares.create({
          ownerUserId: account.userId,
          sharedWithUserId: fillerApp.id,
          resourceType: RESOURCE_TYPES.account,
          resourceId: String(account.id),
          permission: SHARE_PERMISSIONS.read,
          policy: null,
          acceptedAt: new Date(),
        });
      }

      // Create a pending invite directly (bypassing the send-time cap check) so we can
      // exercise the accept-time guard in isolation. Real-world this happens when several
      // pending invites were created before any were accepted.
      const overflow = await helpers.provisionSecondUserWithBaseCurrency();
      const overflowApp = await helpers.findAppUserByEmail({ email: overflow.email });
      const invitation = await ShareInvitations.create({
        ownerUserId: account.userId,
        inviteeEmail: overflow.email.toLowerCase(),
        inviteeUserId: overflowApp.id,
        resourceType: RESOURCE_TYPES.account,
        resourceId: String(account.id),
        permission: SHARE_PERMISSIONS.read,
        policy: null,
        token: generateInvitationToken(),
        status: SHARE_INVITATION_STATUSES.pending,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const res = await helpers.asUser({
        cookies: overflow.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token }),
      });
      expect(res.statusCode).toBe(409);
      expect((res.body.response as unknown as ErrorResponse).message).toMatch(/full|maximum/i);
    });

    it("succeeds when the account's currency differs from the owner's base currency, as long as the recipient's base matches the owner's base", async () => {
      // Bug fix coverage: the currency check should compare recipient's base to *owner's*
      // base, not to the account's currency. An owner can have e.g. a UAH account while
      // their base currency is USD; a USD-base recipient must still be able to accept.
      const usdAccount = await helpers.createAccountWithNewCurrency({ currency: 'USD' });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency(); // base = global.BASE_CURRENCY (AED)

      const invitation = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: usdAccount.account.id,
        permission: SHARE_PERMISSIONS.read,
        raw: true,
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token }),
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.response.invitation.status).toBe(SHARE_INVITATION_STATUSES.accepted);
    });

    it('returns 422 with code SHARE_CURRENCY_MISMATCH and expectedCurrency when base currency does not match', async () => {
      const { recipient, invitation } = await setupPendingInvitation();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
      await forceUserBaseCurrency({ userId: recipientApp.id, currencyCode: 'USD' });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token }),
      });
      expect(res.statusCode).toBe(422);
      const err = res.body.response as unknown as ErrorResponse & {
        details?: { expectedCurrency?: string };
      };
      expect(err.code).toBe(API_ERROR_CODES.shareCurrencyMismatch);
      expect(err.details?.expectedCurrency).toBe(global.BASE_CURRENCY.code);
    });
  });
});

describe('Share invitations: decline', () => {
  it('marks the invitation declined and does not create a share row', async () => {
    const { account, recipient, invitation } = await setupPendingInvitation();

    const res = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.declineShareInvitation({ token: invitation.token }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.response.invitation.status).toBe(SHARE_INVITATION_STATUSES.declined);
    expect(res.body.response.invitation.declinedAt).toBeTruthy();

    const share = await ResourceShares.findOne({
      where: { resourceType: RESOURCE_TYPES.account, resourceId: String(account.id) },
    });
    expect(share).toBeNull();
  });

  it('binds inviteeUserId on decline when the invitation was unresolved at send time', async () => {
    const { recipient, invitation } = await setupUnresolvedInvitationThenSignUp();

    const res = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.declineShareInvitation({ token: invitation.token }),
    });
    expect(res.statusCode).toBe(200);

    const updated = await ShareInvitations.findOne({ where: { id: invitation.id } });
    const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
    expect(updated!.inviteeUserId).toBe(recipientApp.id);
    expect(updated!.status).toBe(SHARE_INVITATION_STATUSES.declined);
  });

  it('returns 409 if attempting to decline an already-declined invitation', async () => {
    const { recipient, invitation } = await setupPendingInvitation();
    await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.declineShareInvitation({ token: invitation.token, raw: true }),
    });

    const res = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.declineShareInvitation({ token: invitation.token }),
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 404 when the token belongs to someone else', async () => {
    const { invitation } = await setupPendingInvitation();
    const other = await helpers.provisionSecondUserWithBaseCurrency();
    const res = await helpers.asUser({
      cookies: other.cookies,
      fn: () => helpers.declineShareInvitation({ token: invitation.token }),
    });
    expect(res.statusCode).toBe(404);
  });
});
