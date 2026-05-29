import { RESOURCE_TYPES, SHARE_INVITATION_STATUSES, SHARE_PERMISSIONS } from '@bt/shared/types';
import { NONEXISTENT_ID } from '@common/lib/record-id-helpers';
import ResourceShares from '@models/resource-shares.model';
import ShareInvitations from '@models/share-invitations.model';
import { shareResourceOrphanCleanupCron } from '@root/crons/share-resource-orphan-cleanup';
import { cleanupOrphanShares } from '@services/sharing/cleanup/cleanup-orphan-shares.service';
import * as helpers from '@tests/helpers';
import { describe, expect, it } from 'vitest';

/**
 * Orphan-cleanup safety net. Runs the daily sweep directly (per the `tag-reminders` /
 * `share-invitations-expire` test precedent — crons have no HTTP surface) against a mix
 * of orphaned and live rows, and asserts only the orphans are pruned.
 */

describe('Share resource orphan cleanup', () => {
  describe('cleanupOrphanShares — direct call', () => {
    it('drops ResourceShares rows whose resourceId points to a nonexistent account', async () => {
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
      const account = await helpers.createAccount({ raw: true });

      // Live, intact share — control: must survive the sweep.
      const liveShare = await ResourceShares.create({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        resourceType: RESOURCE_TYPES.account,
        resourceId: String(account.id),
        permission: SHARE_PERMISSIONS.read,
        acceptedAt: new Date(),
      });

      // Orphan — `resourceId` references an account that doesn't exist. ResourceShares has
      // no DB-level FK to Accounts (resourceId is generic VARCHAR), so this row sticks
      // around until the cron picks it up.
      const orphanShare = await ResourceShares.create({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        resourceType: RESOURCE_TYPES.account,
        resourceId: NONEXISTENT_ID,
        permission: SHARE_PERMISSIONS.read,
        acceptedAt: new Date(),
      });

      const result = await cleanupOrphanShares();
      expect(result.deletedSharesCount).toBeGreaterThanOrEqual(1);

      const liveAfter = await ResourceShares.findByPk(liveShare.id);
      expect(liveAfter).not.toBeNull();
      const orphanAfter = await ResourceShares.findByPk(orphanShare.id);
      expect(orphanAfter).toBeNull();
    });

    it('drops ShareInvitations rows whose resourceId points to a nonexistent account', async () => {
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const account = await helpers.createAccount({ raw: true });

      // Live invitation — created via the service so it goes through real validation.
      const liveInvite = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        permission: SHARE_PERMISSIONS.read,
        raw: true,
      });

      // Orphan invitation — point at a missing account. Bypasses the public endpoint
      // because our send-time validators correctly refuse to issue invitations for
      // resources that don't exist; that's the corner the cron exists to clean.
      const orphanInvite = await ShareInvitations.create({
        ownerUserId: account.userId,
        inviteeEmail: recipient.email,
        inviteeUserId: null,
        resourceType: RESOURCE_TYPES.account,
        resourceId: NONEXISTENT_ID,
        permission: SHARE_PERMISSIONS.read,
        policy: null,
        token: `orphan-token-${Date.now()}`,
        status: SHARE_INVITATION_STATUSES.pending,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const result = await cleanupOrphanShares();
      expect(result.deletedInvitationsCount).toBeGreaterThanOrEqual(1);

      const liveAfter = await ShareInvitations.findByPk(liveInvite.id);
      expect(liveAfter).not.toBeNull();
      const orphanAfter = await ShareInvitations.findByPk(orphanInvite.id);
      expect(orphanAfter).toBeNull();
    });

    it('leaves live household rows alone (sweep extension does not produce false positives)', async () => {
      // Defensive coverage: a true household orphan can't be created through the ORM
      // because the CHECK constraint forces `resourceId = ownerUserId::text` and the
      // FK on `ownerUserId` cascades on user delete. The sweep is there for partial
      // cascade failures and out-of-band DB ops; we can't reproduce those in this
      // test harness without superuser privileges. What we *can* assert: extending
      // the sweep to include `resourceType = 'household'` doesn't accidentally
      // prune live household rows.
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

      const liveHousehold = await ResourceShares.create({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        resourceType: RESOURCE_TYPES.household,
        resourceId: String(account.userId),
        permission: SHARE_PERMISSIONS.read,
        acceptedAt: new Date(),
      });

      await cleanupOrphanShares();

      const after = await ResourceShares.findByPk(liveHousehold.id);
      expect(after).not.toBeNull();
    });

    it('is a no-op when there are no orphans', async () => {
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
      const account = await helpers.createAccount({ raw: true });

      await ResourceShares.create({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        resourceType: RESOURCE_TYPES.account,
        resourceId: String(account.id),
        permission: SHARE_PERMISSIONS.read,
        acceptedAt: new Date(),
      });

      const result = await cleanupOrphanShares();
      expect(result.deletedSharesCount).toBe(0);
      expect(result.deletedInvitationsCount).toBe(0);
    });
  });

  describe('cron manual trigger', () => {
    it('clears orphans end-to-end via the cron entry point', async () => {
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
      const account = await helpers.createAccount({ raw: true });

      const orphan = await ResourceShares.create({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        resourceType: RESOURCE_TYPES.account,
        resourceId: NONEXISTENT_ID,
        permission: SHARE_PERMISSIONS.read,
        acceptedAt: new Date(),
      });

      await shareResourceOrphanCleanupCron.triggerManualCheck();

      const after = await ResourceShares.findByPk(orphan.id);
      expect(after).toBeNull();
    });
  });
});
