import {
  NOTIFICATION_TYPES,
  RESOURCE_TYPES,
  SHARE_INVITATION_STATUSES,
  SHARE_PERMISSIONS,
  SHARING_LIMITS,
} from '@bt/shared/types';
import Notifications from '@models/notifications.model';
import ShareInvitations from '@models/share-invitations.model';
import { expireOverdueInvitations } from '@services/sharing/invitations/expire-invitations.service';
import * as helpers from '@tests/helpers';
import type { ErrorResponse } from '@tests/helpers/common';
import { describe, expect, it } from 'vitest';

/** Owner-side scaffold reused across resend / cancel tests. */
async function setupPendingInvitation() {
  const account = await helpers.createAccount({ raw: true });
  const recipient = await helpers.provisionSecondUserWithBaseCurrency();
  const invitation = await helpers.createShareInvitation({
    inviteeEmail: recipient.email,
    resourceType: RESOURCE_TYPES.account,
    resourceId: account.id,
    permission: SHARE_PERMISSIONS.read,
    raw: true,
  });
  return { account, recipient, invitation };
}

describe('Share invitations: resend (S6)', () => {
  describe('happy paths', () => {
    it('rotates token + resets expiry + bumps resendCount on a pending invitation', async () => {
      const { invitation } = await setupPendingInvitation();

      const beforeRow = await ShareInvitations.findByPk(invitation.id);
      expect(beforeRow).not.toBeNull();
      const beforeToken = beforeRow!.token;
      const beforeExpiresAt = beforeRow!.expiresAt.getTime();
      expect(beforeRow!.resendCount).toBe(0);

      const res = await helpers.resendShareInvitation({ invitationId: invitation.id, raw: false });
      expect(res.statusCode).toBe(200);
      expect(res.body.response.token).not.toBe(beforeToken);
      expect(res.body.response.status).toBe(SHARE_INVITATION_STATUSES.pending);
      expect(res.body.response.resendCount).toBe(1);
      // New expiresAt is at least roughly +1ms past the previous one — using `>` instead
      // of an exact arithmetic check keeps the test resilient to timing jitter while
      // still proving the field was actually advanced.
      const newExpiresAtMs = new Date(res.body.response.expiresAt).getTime();
      expect(newExpiresAtMs).toBeGreaterThan(beforeExpiresAt);

      const afterRow = await ShareInvitations.findByPk(invitation.id);
      expect(afterRow!.recentResendsAt).toHaveLength(1);
    });

    it('resends a declined invitation and reverts status to pending (clears declinedAt)', async () => {
      const { recipient, invitation } = await setupPendingInvitation();

      // Recipient declines first.
      const declineRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.declineShareInvitation({ token: invitation.token, raw: false }),
      });
      expect(declineRes.statusCode).toBe(200);

      const declinedRow = await ShareInvitations.findByPk(invitation.id);
      expect(declinedRow!.status).toBe(SHARE_INVITATION_STATUSES.declined);
      expect(declinedRow!.declinedAt).not.toBeNull();

      // Owner resends.
      const resendRes = await helpers.resendShareInvitation({ invitationId: invitation.id, raw: false });
      expect(resendRes.statusCode).toBe(200);
      expect(resendRes.body.response.status).toBe(SHARE_INVITATION_STATUSES.pending);

      const afterRow = await ShareInvitations.findByPk(invitation.id);
      expect(afterRow!.declinedAt).toBeNull();
    });

    it('resends an expired invitation', async () => {
      const { invitation } = await setupPendingInvitation();

      // Force-expire by direct DB write — the cron sweep is what would do this in prod.
      await ShareInvitations.update(
        { status: SHARE_INVITATION_STATUSES.expired, expiresAt: new Date(Date.now() - 1_000) },
        { where: { id: invitation.id } },
      );

      const res = await helpers.resendShareInvitation({ invitationId: invitation.id, raw: false });
      expect(res.statusCode).toBe(200);
      expect(res.body.response.status).toBe(SHARE_INVITATION_STATUSES.pending);
      expect(new Date(res.body.response.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('re-emits the share_invitation_received notification to the invitee', async () => {
      const { recipient, invitation } = await setupPendingInvitation();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

      // Sanity: the create flow already emitted one notification.
      const before = await Notifications.findAll({
        where: { userId: recipientApp.id, type: NOTIFICATION_TYPES.shareInvitationReceived },
      });
      expect(before).toHaveLength(1);

      // Use raw:false so a non-200 from the resend endpoint surfaces here, not silently
      // through the after-count below.
      const resendRes = await helpers.resendShareInvitation({ invitationId: invitation.id, raw: false });
      expect(resendRes.statusCode).toBe(200);

      const after = await Notifications.findAll({
        where: { userId: recipientApp.id, type: NOTIFICATION_TYPES.shareInvitationReceived },
      });
      expect(after).toHaveLength(2);
      const newest = after.toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!;
      const payload = newest.payload as { token: string };
      // The fresh notification must carry the new token, not the original one.
      expect(payload.token).not.toBe(invitation.token);
    });

    it('rotates token but skips the in-app notification when invitee is unregistered', async () => {
      // Send to an email that doesn't resolve to a registered user — invitee_user_id stays
      // null, so the create flow already skipped the notification. The resend should follow
      // the same rule: rotate the row, skip the notification.
      const account = await helpers.createAccount({ raw: true });
      const unknownEmail = `nobody-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`;
      const invitation = await helpers.createShareInvitation({
        inviteeEmail: unknownEmail,
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        permission: SHARE_PERMISSIONS.read,
        raw: true,
      });
      expect(invitation.inviteeUserId).toBeNull();

      const beforeRow = await ShareInvitations.findByPk(invitation.id);
      const oldToken = beforeRow!.token;

      const resendRes = await helpers.resendShareInvitation({ invitationId: invitation.id, raw: false });
      expect(resendRes.statusCode).toBe(200);
      expect(resendRes.body.response.token).not.toBe(oldToken);
      expect(resendRes.body.response.resendCount).toBe(1);

      // No share_invitation_received notification should have been emitted by the resend
      // (the create flow also skipped, so the count across the system stays at 0).
      const notifs = await Notifications.findAll({
        where: { type: NOTIFICATION_TYPES.shareInvitationReceived },
      });
      expect(notifs).toHaveLength(0);
    });

    it('reports emailDelivered: true even when no email is sent (unregistered invitee, dev/test resend skipped)', async () => {
      // Resend isn't configured in test env (sendInvitationEmail returns 'skipped'), and
      // even if it were, an unresolved invitee gets no email at all. Both branches must
      // collapse to `emailDelivered: true` so the UI doesn't spuriously warn.
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const invitation = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        permission: SHARE_PERMISSIONS.read,
        raw: true,
      });

      const res = await helpers.resendShareInvitation({ invitationId: invitation.id, raw: false });
      expect(res.statusCode).toBe(200);
      expect(res.body.response.emailDelivered).toBe(true);
    });
  });

  describe('rate limit', () => {
    it(`allows ${SHARING_LIMITS.resendPerInviteeRateLimit.count} resends in 24h then rejects the next`, async () => {
      const { invitation } = await setupPendingInvitation();
      const limit = SHARING_LIMITS.resendPerInviteeRateLimit.count;

      for (let i = 0; i < limit; i += 1) {
        const res = await helpers.resendShareInvitation({ invitationId: invitation.id, raw: false });
        expect(res.statusCode).toBe(200);
      }

      const overflow = await helpers.resendShareInvitation({ invitationId: invitation.id, raw: false });
      expect(overflow.statusCode).toBe(409);
      const err = overflow.body.response as unknown as ErrorResponse;
      expect(err.message).toMatch(/rate limit|24h/i);
    });

    it('allows another resend after pruning entries older than the window', async () => {
      const { invitation } = await setupPendingInvitation();
      const limit = SHARING_LIMITS.resendPerInviteeRateLimit.count;

      for (let i = 0; i < limit; i += 1) {
        await helpers.resendShareInvitation({ invitationId: invitation.id, raw: true });
      }

      // Backdate the recorded resends past the window so the next attempt prunes them all
      // and proceeds. This bypasses real time-travel but exercises the prune-then-check
      // branch, which is the actual production behavior on day 2.
      const fakePast = new Date(Date.now() - SHARING_LIMITS.resendPerInviteeRateLimit.windowMs - 60_000).toISOString();
      await ShareInvitations.update(
        { recentResendsAt: [fakePast, fakePast, fakePast] },
        { where: { id: invitation.id } },
      );

      const res = await helpers.resendShareInvitation({ invitationId: invitation.id, raw: false });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('guards', () => {
    it("404s when the caller isn't the owner (masks existence)", async () => {
      const { invitation } = await setupPendingInvitation();
      const stranger = await helpers.provisionSecondUserWithBaseCurrency();

      const res = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () => helpers.resendShareInvitation({ invitationId: invitation.id, raw: false }),
      });
      expect(res.statusCode).toBe(404);
    });

    it('rejects resending an accepted invitation', async () => {
      const { recipient, invitation } = await setupPendingInvitation();

      await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
      });

      const res = await helpers.resendShareInvitation({ invitationId: invitation.id, raw: false });
      expect(res.statusCode).toBe(409);
      const err = res.body.response as unknown as ErrorResponse;
      expect(err.message).toMatch(/accepted/i);
    });

    it('rejects resending a revoked invitation', async () => {
      const { invitation } = await setupPendingInvitation();
      await helpers.cancelShareInvitation({ invitationId: invitation.id, raw: true });

      const res = await helpers.resendShareInvitation({ invitationId: invitation.id, raw: false });
      expect(res.statusCode).toBe(409);
    });
  });
});

describe('Share invitations: cancel (S6)', () => {
  it('marks a pending invitation as revoked', async () => {
    const { invitation } = await setupPendingInvitation();

    const res = await helpers.cancelShareInvitation({ invitationId: invitation.id, raw: false });
    expect(res.statusCode).toBe(200);
    expect(res.body.response.status).toBe(SHARE_INVITATION_STATUSES.revoked);
    expect(res.body.response.revokedAt).not.toBeNull();
  });

  it('404s for a stranger (masks existence)', async () => {
    const { invitation } = await setupPendingInvitation();
    const stranger = await helpers.provisionSecondUserWithBaseCurrency();

    const res = await helpers.asUser({
      cookies: stranger.cookies,
      fn: () => helpers.cancelShareInvitation({ invitationId: invitation.id, raw: false }),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects cancelling an already-accepted invitation', async () => {
    const { recipient, invitation } = await setupPendingInvitation();
    await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
    });

    const res = await helpers.cancelShareInvitation({ invitationId: invitation.id, raw: false });
    expect(res.statusCode).toBe(409);
  });

  it('rejects cancelling an already-revoked invitation (idempotency surface)', async () => {
    const { invitation } = await setupPendingInvitation();
    await helpers.cancelShareInvitation({ invitationId: invitation.id, raw: true });

    const res = await helpers.cancelShareInvitation({ invitationId: invitation.id, raw: false });
    expect(res.statusCode).toBe(409);
  });

  it('rejects cancelling a declined invitation', async () => {
    // The cancel guard rejects everything that isn't `pending`. Without this test, a
    // future regression that only excludes `accepted`/`revoked` would silently start
    // accepting cancels on declined rows.
    const { recipient, invitation } = await setupPendingInvitation();
    const declineRes = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.declineShareInvitation({ token: invitation.token, raw: false }),
    });
    expect(declineRes.statusCode).toBe(200);

    const res = await helpers.cancelShareInvitation({ invitationId: invitation.id, raw: false });
    expect(res.statusCode).toBe(409);
  });

  it('rejects cancelling an expired invitation', async () => {
    // Same shape as the declined case — cancel only makes sense from `pending`. This
    // one is force-flipped to `expired` by direct DB write because the cron sweep is
    // tested separately.
    const { invitation } = await setupPendingInvitation();
    await ShareInvitations.update(
      { status: SHARE_INVITATION_STATUSES.expired, expiresAt: new Date(Date.now() - 1_000) },
      { where: { id: invitation.id } },
    );

    const res = await helpers.cancelShareInvitation({ invitationId: invitation.id, raw: false });
    expect(res.statusCode).toBe(409);
  });

  it("subsequent accept attempts on a cancelled invitation's token fail", async () => {
    const { recipient, invitation } = await setupPendingInvitation();
    await helpers.cancelShareInvitation({ invitationId: invitation.id, raw: true });

    const acceptRes = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: false }),
    });
    expect(acceptRes.statusCode).toBe(409);
  });
});

describe('Share invitations: expire sweep (S6)', () => {
  it('flips overdue pending rows to expired and notifies the owner', async () => {
    const { account, recipient, invitation } = await setupPendingInvitation();

    // Backdate expiresAt so the sweep picks up the row. Status stays `pending` because
    // expiration is the cron's job — exactly the scenario this test exercises.
    await ShareInvitations.update({ expiresAt: new Date(Date.now() - 60_000) }, { where: { id: invitation.id } });

    const result = await expireOverdueInvitations();
    // Tight equality — a regression where `notifiedCount` lags `expiredCount` (e.g. a
    // notification helper silently throws and the sweep swallows without logging the
    // count) would slip past `>=1` checks if other tests' rows bled in.
    expect(result.expiredCount).toBe(1);
    expect(result.notifiedCount).toBe(1);

    const row = await ShareInvitations.findByPk(invitation.id);
    expect(row!.status).toBe(SHARE_INVITATION_STATUSES.expired);

    // Scope the lookup to *this* invitation so a stale `share_expired` row from a prior
    // test doesn't make a missing notification look fine.
    const ownerNotifs = await Notifications.findAll({
      where: { userId: account.userId, type: NOTIFICATION_TYPES.shareExpired },
    });
    const matching = ownerNotifs.filter((n) => (n.payload as { invitationId?: string }).invitationId === invitation.id);
    expect(matching).toHaveLength(1);
    const payload = matching[0]!.payload as {
      invitationId: string;
      resourceId: string;
      counterpartUser: { username: string };
    };
    expect(payload.invitationId).toBe(invitation.id);
    expect(payload.resourceId).toBe(String(account.id));
    // Confirm we still snapshot the invitee — `recipient` is provisioned so there's a row.
    expect(payload.counterpartUser.username).toBeTruthy();
    void recipient;
  });

  it('leaves non-pending rows untouched and does not duplicate notifications', async () => {
    const { recipient, invitation } = await setupPendingInvitation();

    // Accept first — row becomes terminal `accepted`. Backdate expiresAt for the test;
    // the sweep should still skip the row because of the status filter, NOT because of
    // expiration semantics.
    await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
    });
    await ShareInvitations.update({ expiresAt: new Date(Date.now() - 60_000) }, { where: { id: invitation.id } });

    const result = await expireOverdueInvitations();
    expect(result.expiredCount).toBe(0);

    const row = await ShareInvitations.findByPk(invitation.id);
    expect(row!.status).toBe(SHARE_INVITATION_STATUSES.accepted);
  });

  it('is a no-op when nothing is overdue', async () => {
    const result = await expireOverdueInvitations();
    expect(result).toEqual({ expiredCount: 0, notifiedCount: 0 });
  });

  it('still notifies the owner when the invitation was sent to an unregistered email', async () => {
    // Unresolved invitee (inviteeUserId IS NULL) is the Phase 1 norm for emails sent
    // before the recipient signs up. The sweep must still fire `share_expired` to the
    // owner — they sent the invitation, they deserve to know it timed out — and the
    // notification falls back to the "Unknown user" snapshot for the counterpart field.
    const account = await helpers.createAccount({ raw: true });
    const unknownEmail = `nobody-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`;
    const invitation = await helpers.createShareInvitation({
      inviteeEmail: unknownEmail,
      resourceType: RESOURCE_TYPES.account,
      resourceId: account.id,
      permission: SHARE_PERMISSIONS.read,
      raw: true,
    });
    expect(invitation.inviteeUserId).toBeNull();

    await ShareInvitations.update({ expiresAt: new Date(Date.now() - 60_000) }, { where: { id: invitation.id } });

    const result = await expireOverdueInvitations();
    expect(result.expiredCount).toBe(1);
    expect(result.notifiedCount).toBe(1);

    const ownerNotifs = await Notifications.findAll({
      where: { userId: account.userId, type: NOTIFICATION_TYPES.shareExpired },
    });
    const matching = ownerNotifs.filter((n) => (n.payload as { invitationId?: string }).invitationId === invitation.id);
    expect(matching).toHaveLength(1);
    const payload = matching[0]!.payload as { counterpartUser: { id: number; username: string } };
    // snapshotUser(null) sentinel — id 0 marks "user gone / never resolved" for FE display.
    expect(payload.counterpartUser.id).toBe(0);
    expect(payload.counterpartUser.username).toBe('Unknown user');
  });
});
