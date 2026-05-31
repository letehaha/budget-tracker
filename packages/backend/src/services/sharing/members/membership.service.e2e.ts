import type { SharePermission } from '@bt/shared/types';
import { NOTIFICATION_TYPES, RESOURCE_TYPES, SHARE_PERMISSIONS, TRANSACTIONS_WRITE_SCOPES } from '@bt/shared/types';
import Notifications from '@models/notifications.model';
import ResourceShares from '@models/resource-shares.model';
import * as helpers from '@tests/helpers';
import type { ErrorResponse } from '@tests/helpers/common';
import { describe, expect, it } from 'vitest';

/**
 * Common scaffold: owner creates an account, invites the recipient at `permission`, and
 * the recipient accepts. Returns everything the test needs to drive both sides of the API.
 */
async function setupAcceptedShare({ permission = SHARE_PERMISSIONS.read }: { permission?: SharePermission } = {}) {
  const account = await helpers.createAccount({ raw: true });
  const recipient = await helpers.provisionSecondUserWithBaseCurrency();
  const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

  const invitation = await helpers.createShareInvitation({
    inviteeEmail: recipient.email,
    resourceType: RESOURCE_TYPES.account,
    resourceId: account.id,
    permission,
    raw: true,
  });

  await helpers.asUser({
    cookies: recipient.cookies,
    fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
  });

  return { account, recipient, recipientApp, invitation };
}

describe('Share membership (S5)', () => {
  describe('GET /share/resources/:type/:id/members', () => {
    it('returns owner + accepted recipient for the owner', async () => {
      const { account, recipientApp } = await setupAcceptedShare();

      const res = await helpers.listShareMembers({
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        raw: false,
      });
      expect(res.statusCode).toBe(200);
      const body = res.body.response;
      expect(body.resourceType).toBe(RESOURCE_TYPES.account);
      expect(body.resourceId).toBe(String(account.id));
      expect(body.members).toHaveLength(2);

      const owner = body.members.find((m) => m.role === 'owner');
      const recipient = body.members.find((m) => m.role === 'recipient');
      expect(owner).toBeDefined();
      expect(owner!.permission).toBe(SHARE_PERMISSIONS.manage);
      expect(owner!.shareId).toBeNull();
      expect(recipient).toBeDefined();
      expect(recipient!.user.id).toBe(recipientApp.id);
      expect(recipient!.permission).toBe(SHARE_PERMISSIONS.read);
      expect(recipient!.shareId).toBeTruthy();
      expect(recipient!.acceptedAt).toBeTruthy();
    });

    it('returns the membership for a manage-permission recipient', async () => {
      const { account, recipient } = await setupAcceptedShare({ permission: SHARE_PERMISSIONS.manage });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.listShareMembers({
            resourceType: RESOURCE_TYPES.account,
            resourceId: account.id,
            raw: false,
          }),
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.response.members.map((m) => m.role).toSorted()).toEqual(['owner', 'recipient']);
    });

    it('404s for a recipient with read-only permission (insufficient to manage members)', async () => {
      const { account, recipient } = await setupAcceptedShare({ permission: SHARE_PERMISSIONS.read });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.listShareMembers({
            resourceType: RESOURCE_TYPES.account,
            resourceId: account.id,
            raw: false,
          }),
      });
      expect(res.statusCode).toBe(404);
    });

    it('404s for a stranger', async () => {
      const account = await helpers.createAccount({ raw: true });
      const stranger = await helpers.provisionSecondUserWithBaseCurrency();

      const res = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () =>
          helpers.listShareMembers({
            resourceType: RESOURCE_TYPES.account,
            resourceId: account.id,
            raw: false,
          }),
      });
      expect(res.statusCode).toBe(404);
    });

    it('does not surface pending (not-yet-accepted) invitations as members', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        permission: SHARE_PERMISSIONS.read,
        raw: true,
      });

      const body = await helpers.listShareMembers({
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        raw: true,
      });
      // Only the owner shows up — invitation hasn't been accepted yet.
      expect(body.members).toHaveLength(1);
      expect(body.members[0]!.role).toBe('owner');
    });
  });

  describe('PATCH /share/resources/:type/:id/members/:userId', () => {
    it('owner promotes a recipient from read to write — policy materialises to default (all)', async () => {
      const { account, recipientApp } = await setupAcceptedShare({ permission: SHARE_PERMISSIONS.read });

      const res = await helpers.updateShareMember({
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        memberUserId: recipientApp.id,
        permission: SHARE_PERMISSIONS.write,
        raw: false,
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.response.permission).toBe(SHARE_PERMISSIONS.write);
      expect(res.body.response.policy).toEqual({ transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all });
    });

    it('owner downgrades a write recipient to read — policy collapses to null', async () => {
      const { account, recipientApp } = await setupAcceptedShare({ permission: SHARE_PERMISSIONS.write });

      const res = await helpers.updateShareMember({
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        memberUserId: recipientApp.id,
        permission: SHARE_PERMISSIONS.read,
        raw: false,
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.response.permission).toBe(SHARE_PERMISSIONS.read);
      expect(res.body.response.policy).toBeNull();
    });

    it('owner flips transactionsWriteScope from all to own without touching permission', async () => {
      const { account, recipientApp } = await setupAcceptedShare({ permission: SHARE_PERMISSIONS.write });

      const res = await helpers.updateShareMember({
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        memberUserId: recipientApp.id,
        policy: { transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.own },
        raw: false,
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.response.permission).toBe(SHARE_PERMISSIONS.write);
      expect(res.body.response.policy).toEqual({ transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.own });
    });

    it('rejects targeting the owner', async () => {
      const { account } = await setupAcceptedShare();

      const res = await helpers.updateShareMember({
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        memberUserId: account.userId,
        permission: SHARE_PERMISSIONS.read,
        raw: false,
      });
      expect(res.statusCode).toBe(422);
      const err = res.body.response as unknown as ErrorResponse;
      expect(err.message).toMatch(/owner/i);
    });

    it('rejects an empty body', async () => {
      const { account, recipientApp } = await setupAcceptedShare();

      const res = await helpers.updateShareMember({
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        memberUserId: recipientApp.id,
        raw: false,
      });
      expect(res.statusCode).toBe(422);
    });

    it('404s for a stranger', async () => {
      const { account, recipientApp } = await setupAcceptedShare();
      const stranger = await helpers.provisionSecondUserWithBaseCurrency();

      const res = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () =>
          helpers.updateShareMember({
            resourceType: RESOURCE_TYPES.account,
            resourceId: account.id,
            memberUserId: recipientApp.id,
            permission: SHARE_PERMISSIONS.write,
            raw: false,
          }),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /share/resources/:type/:id/members/:userId', () => {
    it('owner revokes a recipient — share row gone, recipient gets a notification, account no longer in their list', async () => {
      const { account, recipient, recipientApp } = await setupAcceptedShare();

      const res = await helpers.revokeShareMember({
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        memberUserId: recipientApp.id,
        raw: false,
      });
      expect(res.statusCode).toBe(204);

      const remaining = await ResourceShares.count({
        where: { resourceType: RESOURCE_TYPES.account, resourceId: String(account.id) },
      });
      expect(remaining).toBe(0);

      const recipientNotifs = await Notifications.findAll({
        where: { userId: recipientApp.id, type: NOTIFICATION_TYPES.shareRevoked },
      });
      expect(recipientNotifs).toHaveLength(1);
      const payload = recipientNotifs[0]!.payload as {
        resourceType: string;
        resourceId: string;
        resourceName: string;
        counterpartUser: { username: string };
      };
      expect(payload.resourceType).toBe(RESOURCE_TYPES.account);
      expect(payload.resourceId).toBe(String(account.id));
      expect(payload.counterpartUser.username).toBeTruthy();

      // Account drops out of the recipient's list straight away (read-path is share-aware).
      const recipientAccounts = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getAccounts(),
      });
      expect(recipientAccounts.find((a) => a.id === account.id)).toBeUndefined();
    });

    it('rejects targeting the owner', async () => {
      const { account } = await setupAcceptedShare();

      const res = await helpers.revokeShareMember({
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        memberUserId: account.userId,
        raw: false,
      });
      expect(res.statusCode).toBe(422);
    });

    it('rejects self-revoke (caller is the manage recipient targeting themselves)', async () => {
      const { account, recipient, recipientApp } = await setupAcceptedShare({
        permission: SHARE_PERMISSIONS.manage,
      });

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.revokeShareMember({
            resourceType: RESOURCE_TYPES.account,
            resourceId: account.id,
            memberUserId: recipientApp.id,
            raw: false,
          }),
      });
      expect(res.statusCode).toBe(422);
      const err = res.body.response as unknown as ErrorResponse;
      expect(err.message).toMatch(/leave/i);
    });

    it('404s for a stranger', async () => {
      const { account, recipientApp } = await setupAcceptedShare();
      const stranger = await helpers.provisionSecondUserWithBaseCurrency();

      const res = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () =>
          helpers.revokeShareMember({
            resourceType: RESOURCE_TYPES.account,
            resourceId: account.id,
            memberUserId: recipientApp.id,
            raw: false,
          }),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /share/shared-with-me', () => {
    it("lists the recipient's accepted share with owner snapshot + resource name", async () => {
      const { account, recipient } = await setupAcceptedShare({ permission: SHARE_PERMISSIONS.write });

      const items = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.listSharedWithMe({ raw: true }),
      });
      const found = items.find((i) => i.resourceId === String(account.id));
      expect(found).toBeDefined();
      expect(found!.resourceType).toBe(RESOURCE_TYPES.account);
      expect(found!.resourceName).toBeTruthy();
      expect(found!.permission).toBe(SHARE_PERMISSIONS.write);
      expect(found!.policy).toEqual({ transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all });
      expect(found!.owner.username).toBeTruthy();
    });

    it('does not include resources the caller owns', async () => {
      const account = await helpers.createAccount({ raw: true });

      const items = await helpers.listSharedWithMe({ raw: true });
      expect(items.find((i) => i.resourceId === String(account.id))).toBeUndefined();
    });

    it('returns an empty list for a user with no shares', async () => {
      const stranger = await helpers.provisionSecondUserWithBaseCurrency();

      const items = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () => helpers.listSharedWithMe({ raw: true }),
      });
      expect(items).toEqual([]);
    });
  });

  describe('POST /share/shared-with-me/:type/:id/leave', () => {
    it('recipient leaves — share row gone, owner gets a notification, account drops from recipient list', async () => {
      const { account, recipient, recipientApp } = await setupAcceptedShare({ permission: SHARE_PERMISSIONS.write });
      const ownerUserId = account.userId;

      const res = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.leaveShare({
            resourceType: RESOURCE_TYPES.account,
            resourceId: account.id,
            raw: false,
          }),
      });
      expect(res.statusCode).toBe(204);

      const remaining = await ResourceShares.count({
        where: {
          sharedWithUserId: recipientApp.id,
          resourceType: RESOURCE_TYPES.account,
          resourceId: String(account.id),
        },
      });
      expect(remaining).toBe(0);

      const ownerNotifs = await Notifications.findAll({
        where: { userId: ownerUserId, type: NOTIFICATION_TYPES.shareLeft },
      });
      expect(ownerNotifs).toHaveLength(1);
      const payload = ownerNotifs[0]!.payload as {
        resourceType: string;
        resourceId: string;
        counterpartUser: { id: number; username: string };
      };
      expect(payload.resourceType).toBe(RESOURCE_TYPES.account);
      expect(payload.resourceId).toBe(String(account.id));
      expect(payload.counterpartUser.id).toBe(recipientApp.id);

      const recipientAccounts = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getAccounts(),
      });
      expect(recipientAccounts.find((a) => a.id === account.id)).toBeUndefined();
    });

    it('404s when the caller is the resource owner (no recipient row to leave)', async () => {
      const { account } = await setupAcceptedShare();

      const res = await helpers.leaveShare({
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        raw: false,
      });
      expect(res.statusCode).toBe(404);
    });

    it('404s for a stranger', async () => {
      const account = await helpers.createAccount({ raw: true });
      const stranger = await helpers.provisionSecondUserWithBaseCurrency();

      const res = await helpers.asUser({
        cookies: stranger.cookies,
        fn: () =>
          helpers.leaveShare({
            resourceType: RESOURCE_TYPES.account,
            resourceId: account.id,
            raw: false,
          }),
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
