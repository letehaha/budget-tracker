import {
  NOTIFICATION_TYPES,
  RESOURCE_TYPES,
  SHARE_INVITATION_STATUSES,
  SHARE_PERMISSIONS,
  SHARING_LIMITS,
  TRANSACTIONS_WRITE_SCOPES,
} from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import Notifications from '@models/notifications.model';
import ResourceShares from '@models/resource-shares.model';
import ShareInvitations from '@models/share-invitations.model';
import * as helpers from '@tests/helpers';
import { ErrorResponse } from '@tests/helpers/common';

describe('Share invitations: create + list', () => {
  describe('happy path', () => {
    it('creates a pending invitation, returns it, and surfaces it in sender + recipient lists', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();

      const res = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        permission: SHARE_PERMISSIONS.read,
      });

      expect(res.statusCode).toBe(201);
      const invitation = res.body.response;
      expect(invitation.status).toBe(SHARE_INVITATION_STATUSES.pending);
      expect(invitation.permission).toBe(SHARE_PERMISSIONS.read);
      expect(invitation.policy).toBeNull();
      expect(invitation.token).toBeTruthy();
      expect(typeof invitation.token).toBe('string');

      const sent = await helpers.listSentShareInvitations({ raw: true });
      expect(sent).toHaveLength(1);
      expect(sent[0]!.id).toBe(invitation.id);
      expect(sent[0]!.resourceName).toBe(account.name);

      const received = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.listReceivedShareInvitations({ raw: true }),
      });
      expect(received).toHaveLength(1);
      expect(received[0]!.id).toBe(invitation.id);
      expect(received[0]!.owner).not.toBeNull();
    });

    it('normalizes write permission with default transactionsWriteScope = all', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();

      const invitation = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        permission: SHARE_PERMISSIONS.write,
        raw: true,
      });

      expect(invitation.permission).toBe(SHARE_PERMISSIONS.write);
      expect(invitation.policy).toEqual({ transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all });
    });

    it('preserves explicit transactionsWriteScope = own when provided', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();

      const invitation = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        permission: SHARE_PERMISSIONS.write,
        policy: { transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.own },
        raw: true,
      });

      expect(invitation.policy).toEqual({ transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.own });
    });

    it('drops policy when permission is read (scope is meaningless)', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();

      const invitation = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        permission: SHARE_PERMISSIONS.read,
        policy: { transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.own },
        raw: true,
      });

      expect(invitation.policy).toBeNull();
    });
  });

  describe('empty state', () => {
    it('returns empty arrays when there are no invitations', async () => {
      const sent = await helpers.listSentShareInvitations({ raw: true });
      const received = await helpers.listReceivedShareInvitations({ raw: true });
      expect(sent).toEqual([]);
      expect(received).toEqual([]);
    });
  });

  describe('user-enumeration mitigation (PRD D6)', () => {
    it("includes the invitation token in the recipient's in-app notification payload (so the click handler can deep-link)", async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();

      const sendRes = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        permission: SHARE_PERMISSIONS.read,
      });
      expect(sendRes.statusCode).toBe(201);

      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
      const notifs = await Notifications.findAll({
        where: { type: NOTIFICATION_TYPES.shareInvitationReceived, userId: recipientApp.id },
      });
      expect(notifs).toHaveLength(1);
      const payload = notifs[0]!.payload as { token?: string; invitationId?: string };
      expect(payload.token).toBe(sendRes.body.response.token);
      expect(payload.invitationId).toBe(sendRes.body.response.id);
    });

    it('creates a pending row with inviteeUserId=null when the email is unregistered, and skips notification', async () => {
      const account = await helpers.createAccount({ raw: true });
      const unknownEmail = `nobody-${Date.now()}@test.local`;

      const res = await helpers.createShareInvitation({
        inviteeEmail: unknownEmail,
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        permission: SHARE_PERMISSIONS.read,
      });

      // Same status code as a resolved-email send — owner can't tell the two cases apart.
      expect(res.statusCode).toBe(201);
      expect(res.body.response.status).toBe(SHARE_INVITATION_STATUSES.pending);
      expect(res.body.response.inviteeUserId).toBeNull();

      const row = await ShareInvitations.findOne({ where: { id: res.body.response.id } });
      expect(row).not.toBeNull();
      expect(row!.inviteeUserId).toBeNull();
      // Stored lowercased — case-insensitive accept-time match relies on it.
      expect(row!.inviteeEmail).toBe(unknownEmail.toLowerCase());

      // Phase 1 sends no in-app notification for unresolved invitees. A side-effect-free
      // assertion: there's no `share_invitation_received` notification anywhere.
      const notifs = await Notifications.findAll({
        where: { type: NOTIFICATION_TYPES.shareInvitationReceived },
      });
      expect(notifs).toHaveLength(0);
    });

    it('still rejects mismatched currency at *acceptance* time, not at send time', async () => {
      // Owner has a USD account (different from base AED). Recipient has base = AED.
      // Pre-fix this would 422 at send; now it 201s and the mismatch surfaces at accept.
      const usdAccount = await helpers.createAccountWithNewCurrency({ currency: 'USD' });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();

      const res = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: usdAccount.account.id,
        permission: SHARE_PERMISSIONS.read,
      });

      expect(res.statusCode).toBe(201);
      expect(res.body.response.status).toBe(SHARE_INVITATION_STATUSES.pending);
      expect(res.body.response.inviteeUserId).not.toBeNull();
    });

    // Note: the "duplicate share" deferred-to-accept path can't be exercised through real
    // send paths while the recipient cap is 1 (any prior accepted share already maxes the
    // cap and trips the cap-conflict branch first). The idempotent accept logic remains
    // defensive for cases where the cap is later raised or admin tooling pre-creates a
    // share row. Direct coverage for the idempotent path lives in the accept e2e suite.
  });

  describe('owner-side validation errors (kept loud — no leak)', () => {
    it('rejects self-invitation', async () => {
      const account = await helpers.createAccount({ raw: true });

      const res = await helpers.createShareInvitation({
        inviteeEmail: 'test1@test.local',
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        permission: SHARE_PERMISSIONS.read,
      });

      expect(res.statusCode).toBe(422);
      expect((res.body.response as unknown as ErrorResponse).message).toMatch(/yourself/i);
    });

    it('returns 404 when the resource is not owned by the caller', async () => {
      const account = await helpers.createAccount({ raw: true });
      const otherUser = await helpers.provisionSecondUserWithBaseCurrency();
      const yetAnotherUser = await helpers.signUpSecondUser();

      const res = await helpers.asUser({
        cookies: otherUser.cookies,
        fn: () =>
          helpers.createShareInvitation({
            inviteeEmail: yetAnotherUser.email,
            resourceType: RESOURCE_TYPES.account,
            resourceId: account.id,
            permission: SHARE_PERMISSIONS.read,
          }),
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 404 for a non-existent account id', async () => {
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const res = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: 999_999_999,
        permission: SHARE_PERMISSIONS.read,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('conflict / limit errors', () => {
    it('allows multiple pending invitations for the same resource (no per-resource pending uniqueness)', async () => {
      // Per F11 the only per-resource constraint left is the *accepted* recipient cap.
      // Pending invites are unlimited in dev/test (and capped at 10 in prod). Sending a
      // second invite to a different email while the first is still pending must succeed.
      const account = await helpers.createAccount({ raw: true });
      const firstRecipient = await helpers.provisionSecondUserWithBaseCurrency();
      const secondRecipient = await helpers.provisionSecondUserWithBaseCurrency();

      const firstRes = await helpers.createShareInvitation({
        inviteeEmail: firstRecipient.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        permission: SHARE_PERMISSIONS.read,
      });
      expect(firstRes.statusCode).toBe(201);

      const secondRes = await helpers.createShareInvitation({
        inviteeEmail: secondRecipient.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        permission: SHARE_PERMISSIONS.read,
      });
      expect(secondRes.statusCode).toBe(201);

      // Two distinct invitation rows for the same account.
      const sent = await helpers.listSentShareInvitations({ raw: true });
      expect(sent).toHaveLength(2);
      const ids = new Set(sent.map((row) => row.id));
      expect(ids).toEqual(new Set([firstRes.body.response.id, secondRes.body.response.id]));
    });

    it('rejects when the recipient cap is reached (counts accepted shares only)', async () => {
      const account = await helpers.createAccount({ raw: true });
      const newRecipient = await helpers.provisionSecondUserWithBaseCurrency();

      // Cap is 2 — pre-create that many accepted shares directly to fill the cap.
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

      const res = await helpers.createShareInvitation({
        inviteeEmail: newRecipient.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        permission: SHARE_PERMISSIONS.read,
      });

      expect(res.statusCode).toBe(409);
      expect((res.body.response as unknown as ErrorResponse).message).toMatch(/maximum/i);
    });

    it('rejects a new invitation when the per-resource pending cap is reached (test env: 3)', async () => {
      // Test env caps pending invites at 3 (see SHARING_LIMITS.maxPendingInvitationsPerResourceTest).
      // Create that many distinct pending invites, then the 4th must 409.
      const account = await helpers.createAccount({ raw: true });

      expect(SHARING_LIMITS.maxPendingInvitationsPerResourceTest).toBe(3);
      for (let i = 0; i < SHARING_LIMITS.maxPendingInvitationsPerResourceTest; i++) {
        const filler = await helpers.provisionSecondUserWithBaseCurrency();
        const fillerRes = await helpers.createShareInvitation({
          inviteeEmail: filler.email,
          resourceType: RESOURCE_TYPES.account,
          resourceId: account.id,
          permission: SHARE_PERMISSIONS.read,
        });
        expect(fillerRes.statusCode).toBe(201);
      }

      const overflow = await helpers.provisionSecondUserWithBaseCurrency();
      const res = await helpers.createShareInvitation({
        inviteeEmail: overflow.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        permission: SHARE_PERMISSIONS.read,
      });
      expect(res.statusCode).toBe(409);
      expect((res.body.response as unknown as ErrorResponse).message).toMatch(/pending invitations/i);
    });
  });

  describe('listReceivedInvitations: surfaces unresolved invites by email match (PRD D6)', () => {
    it('returns a pending invite that was created before the recipient signed up, matched by email', async () => {
      const account = await helpers.createAccount({ raw: true });
      const futureEmail = `future-user-${Date.now()}@test.local`;

      // Owner sends invite to an email that doesn't exist yet — row is created with
      // inviteeUserId=null. Then the recipient signs up using that same email.
      const sendRes = await helpers.createShareInvitation({
        inviteeEmail: futureEmail,
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        permission: SHARE_PERMISSIONS.read,
      });
      expect(sendRes.statusCode).toBe(201);

      const recipient = await helpers.signUpSecondUser({ email: futureEmail });
      await helpers.asUser({
        cookies: recipient.cookies,
        fn: async () => {
          await helpers.setBaseCurrencyForActiveUser({ currencyCode: global.BASE_CURRENCY.code });
        },
      });

      const received = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.listReceivedShareInvitations({ raw: true }),
      });

      expect(received).toHaveLength(1);
      expect(received[0]!.id).toBe(sendRes.body.response.id);
      // The invitation row itself still has inviteeUserId=null at this point — binding
      // happens on accept/decline, not on listing.
      expect(received[0]!.inviteeUserId).toBeNull();
    });
  });
});
