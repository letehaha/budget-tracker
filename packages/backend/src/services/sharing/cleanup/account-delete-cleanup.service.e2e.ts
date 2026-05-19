import {
  NOTIFICATION_TYPES,
  RESOURCE_TYPES,
  SHARE_INVITATION_STATUSES,
  SHARE_PERMISSIONS,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
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
  accountId: string;
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
      const res = await helpers.deleteAccount({ id: generateRandomRecordId(), raw: false });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('cross-user transfers', () => {
    it('converts the partner leg to out_of_wallet when an account in a cross-user pair is deleted', async () => {
      // Setup: primary (test1) hosts a household; second user joins and creates a transfer
      // between their own account and one of test1's accounts. test1 then deletes the
      // account that hosts one leg of the pair. Without the cleanup, the partner leg on
      // the second user's account would survive with a `transferId` pointing at the
      // cascade-deleted partner — orphan half-transfer the UI can't render.
      const sourceAccount = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ name: 'Primary A', initialBalance: 10000 }),
        raw: true,
      });
      const primaryUser = await helpers.findAppUserByEmail({ email: 'test1@test.local' });

      const secondary = await helpers.provisionSecondUserWithBaseCurrency();
      const secondaryApp = await helpers.findAppUserByEmail({ email: secondary.email });

      // Provision the secondary side: their own account + a category id we can reuse on
      // the base leg of the cross-user transfer (categoryId=1 belongs to primary user, so
      // we have to fetch one that secondary actually owns).
      const { destAccount, secondaryCategoryId } = await helpers.asUser({
        cookies: secondary.cookies,
        fn: async () => {
          const acc = await helpers.createAccount({
            payload: helpers.buildAccountPayload({ name: 'Secondary B', initialBalance: 2000 }),
            raw: true,
          });
          const categories = await helpers.getCategoriesList();
          return { destAccount: acc, secondaryCategoryId: categories[0]!.id };
        },
      });

      const invitation = await helpers.createHouseholdInvitation({
        ownerUserId: primaryUser.id,
        inviteeEmail: secondary.email,
      });
      await helpers.asUser({
        cookies: secondary.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
      });

      // Secondary creates a transfer from their own account into primary's account using
      // their household write access. Both legs share a `transferId`.
      const [secondaryLeg, primaryLeg] = await helpers.asUser({
        cookies: secondary.cookies,
        fn: () =>
          helpers.createTransaction({
            payload: {
              ...helpers.buildTransactionPayload({
                accountId: destAccount.id,
                amount: 5000,
                transactionType: TRANSACTION_TYPES.expense,
                categoryId: secondaryCategoryId,
              }),
              transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
              destinationAmount: 5000,
              destinationAccountId: sourceAccount.id,
            },
            raw: true,
          }),
      });
      expect(secondaryLeg!.transferId).toBeTruthy();
      expect(secondaryLeg!.transferId).toBe(primaryLeg!.transferId);
      // Each leg's `userId` is the account OWNER (not the creator) — `create-transaction`
      // stamps the destination leg with `destOwnerUserId` so cross-user transfers stay
      // attributable to each side's wallet.
      expect(secondaryLeg!.userId).toBe(secondaryApp.id);
      expect(primaryLeg!.userId).toBe(primaryUser.id);

      // Primary deletes the account that hosts the inbound leg. Cascade should drop
      // the inbound leg; the outbound leg on the secondary's account must convert to
      // out_of_wallet rather than be left orphaned.
      await helpers.deleteAccount({ id: sourceAccount.id, raw: true });

      const inboundAfter = await helpers.getTransactionById({ id: primaryLeg!.id, raw: true });
      expect(inboundAfter).toBeNull();

      const outboundAfter = await helpers.asUser({
        cookies: secondary.cookies,
        fn: () => helpers.getTransactionById({ id: secondaryLeg!.id, raw: true }),
      });
      expect(outboundAfter).not.toBeNull();
      expect(outboundAfter!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_out_wallet);
      expect(outboundAfter!.transferId).toBeNull();
      // Note suffix preserves a paper trail of where the funds went.
      expect(outboundAfter!.note).toContain('Primary A');
    });

    it('leaves same-user transfers between the deleted account and a sibling account alone', async () => {
      // Same-user pairs intentionally fall outside this cleanup — they're left to the
      // (separate, pre-existing) intra-user transfer cleanup path. The cross-user cleanup
      // should not fire for them.
      const accountA = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ name: 'Self A', initialBalance: 8000 }),
        raw: true,
      });
      const accountB = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ name: 'Self B', initialBalance: 2000 }),
        raw: true,
      });

      const [legA, legB] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: accountA.id,
            amount: 1500,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAmount: 1500,
          destinationAccountId: accountB.id,
        },
        raw: true,
      });
      expect(legA!.transferId).toBe(legB!.transferId);

      await helpers.deleteAccount({ id: accountA.id, raw: true });

      // Cross-user cleanup must not have rewritten the surviving leg into out_of_wallet
      // — same-user pairs are out of its scope.
      const legBAfter = await helpers.getTransactionById({ id: legB!.id, raw: true });
      expect(legBAfter).not.toBeNull();
      expect(legBAfter!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
    });
  });
});
