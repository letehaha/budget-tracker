import { NOTIFICATION_TYPES, RESOURCE_TYPES, SHARE_INVITATION_STATUSES, SHARE_PERMISSIONS } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import Notifications from '@models/notifications.model';
import ResourceShares from '@models/resource-shares.model';
import ShareInvitations from '@models/share-invitations.model';
import * as helpers from '@tests/helpers';

/**
 * S8 — Account-deletion cleanup. Verifies that deleting an account drops any associated
 * `ResourceShares`, revokes outstanding `ShareInvitations`, and notifies recipients via
 * `share_owner_account_deleted`. Goes through the public `DELETE /accounts/:id` endpoint
 * per the project rule that e2e tests never call services directly.
 */

async function shareAccountWithRecipient({
  accountId,
  recipient,
  permission = SHARE_PERMISSIONS.read,
}: {
  accountId: number;
  recipient: helpers.SecondUserHandle;
  permission?: (typeof SHARE_PERMISSIONS)[keyof typeof SHARE_PERMISSIONS];
}) {
  const invitation = await helpers.createShareInvitation({
    inviteeEmail: recipient.email,
    resourceType: RESOURCE_TYPES.account,
    resourceId: accountId,
    permission,
    raw: true,
  });
  await helpers.asUser({
    cookies: recipient.cookies,
    fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
  });
  return invitation;
}

describe('Account delete: family-sharing cleanup (S8)', () => {
  describe('happy paths', () => {
    it('drops ResourceShares rows for the deleted account', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      await shareAccountWithRecipient({ accountId: account.id, recipient });

      const beforeShares = await ResourceShares.findAll({
        where: { resourceType: RESOURCE_TYPES.account, resourceId: String(account.id) },
      });
      expect(beforeShares).toHaveLength(1);

      await helpers.deleteAccount({ id: account.id, raw: true });

      const afterShares = await ResourceShares.findAll({
        where: { resourceType: RESOURCE_TYPES.account, resourceId: String(account.id) },
      });
      expect(afterShares).toHaveLength(0);
    });

    it('emits share_owner_account_deleted to each accepted recipient', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      await shareAccountWithRecipient({ accountId: account.id, recipient });
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

      const before = await Notifications.findAll({
        where: { userId: recipientApp.id, type: NOTIFICATION_TYPES.shareOwnerAccountDeleted },
      });
      expect(before).toHaveLength(0);

      await helpers.deleteAccount({ id: account.id, raw: true });

      const after = await Notifications.findAll({
        where: { userId: recipientApp.id, type: NOTIFICATION_TYPES.shareOwnerAccountDeleted },
      });
      expect(after).toHaveLength(1);
      expect(after[0]!.payload).toMatchObject({
        resourceType: RESOURCE_TYPES.account,
        resourceId: String(account.id),
      });
    });

    it('flips pending invitations to revoked', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const invitation = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        permission: SHARE_PERMISSIONS.read,
        raw: true,
      });

      await helpers.deleteAccount({ id: account.id, raw: true });

      const after = await ShareInvitations.findByPk(invitation.id);
      expect(after).not.toBeNull();
      expect(after!.status).toBe(SHARE_INVITATION_STATUSES.revoked);
      expect(after!.revokedAt).not.toBeNull();
    });

    it('isolates cleanup to the deleted account — sibling shares survive', async () => {
      const accountA = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      await shareAccountWithRecipient({ accountId: accountA.id, recipient });
      await shareAccountWithRecipient({ accountId: accountB.id, recipient });

      await helpers.deleteAccount({ id: accountA.id, raw: true });

      const remainingB = await ResourceShares.findAll({
        where: { resourceType: RESOURCE_TYPES.account, resourceId: String(accountB.id) },
      });
      expect(remainingB).toHaveLength(1);
    });
  });

  describe('quiet paths', () => {
    it('does not emit a notification when the deleted account had no shares', async () => {
      const account = await helpers.createAccount({ raw: true });
      const otherUser = await helpers.provisionSecondUserWithBaseCurrency();
      const otherUserApp = await helpers.findAppUserByEmail({ email: otherUser.email });

      const before = await Notifications.findAll({
        where: { userId: otherUserApp.id, type: NOTIFICATION_TYPES.shareOwnerAccountDeleted },
      });

      const res = await helpers.deleteAccount({ id: account.id, raw: false });
      expect(res.statusCode).toBe(200);

      const after = await Notifications.findAll({
        where: { userId: otherUserApp.id, type: NOTIFICATION_TYPES.shareOwnerAccountDeleted },
      });
      expect(after.length).toBe(before.length);
    });

    it('does not modify pending invitations belonging to a different account', async () => {
      const accountA = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const inviteB = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: accountB.id,
        permission: SHARE_PERMISSIONS.read,
        raw: true,
      });

      await helpers.deleteAccount({ id: accountA.id, raw: true });

      const after = await ShareInvitations.findByPk(inviteB.id);
      expect(after).not.toBeNull();
      expect(after!.status).toBe(SHARE_INVITATION_STATUSES.pending);
    });
  });

  describe('error paths', () => {
    it('returns 404 when the account does not exist', async () => {
      const res = await helpers.deleteAccount({ id: 999_999_999, raw: false });
      expect(res.statusCode).toBe(404);
    });
  });
});
