import { ACCESS_SOURCES, RESOURCE_TYPES, SHARE_PERMISSIONS } from '@bt/shared/types';
import Accounts from '@models/accounts.model';
import ResourceShares from '@models/resource-shares.model';
import * as helpers from '@tests/helpers';
import { describe, expect, it } from 'vitest';

/**
 * Shared resource visibility for household memberships.
 *
 * Verifies that the recipient-facing list endpoints (`GET /accounts`,
 * `GET /share/shared-with-me`) surface accounts and rows derived from an accepted
 * household membership, with the right `accessSource` discriminator so the frontend
 * can route management UI correctly. Also verifies the precedence rule: when both a
 * per-resource share and a household membership grant access to the same account, the
 * per-resource share wins and the row reports `accessSource='share'`.
 *
 * Household membership rows are seeded directly via `ResourceShares.create` to isolate
 * visibility behavior from the invitation accept path. DB CHECK constraints enforce the
 * row shape so the seeded rows can't drift from production rows.
 */

type AccountListResponse = Array<{
  id: string;
  externalId: string | null;
  bankDataProviderConnectionId: number | null;
  share?: { isOwner: boolean; permission: string; accessSource: string };
}>;

const seedHouseholdMembership = async ({
  ownerUserId,
  sharedWithUserId,
  permission,
  acceptedAt = new Date(),
}: {
  ownerUserId: number;
  sharedWithUserId: number;
  permission: (typeof SHARE_PERMISSIONS)[keyof typeof SHARE_PERMISSIONS];
  acceptedAt?: Date | null;
}) =>
  ResourceShares.create({
    ownerUserId,
    sharedWithUserId,
    resourceType: RESOURCE_TYPES.household,
    resourceId: String(ownerUserId),
    permission,
    acceptedAt,
  });

describe('Shared resource visibility — household-derived', () => {
  describe('GET /accounts', () => {
    it('surfaces every account owned by a household grantor with accessSource=household', async () => {
      const accountA = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ name: 'second' }),
        raw: true,
      });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

      await seedHouseholdMembership({
        ownerUserId: accountA.userId,
        sharedWithUserId: recipientApp.id,
        permission: SHARE_PERMISSIONS.write,
      });

      const accounts = (await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getAccounts(),
      })) as unknown as AccountListResponse;

      const visibleIds = new Set(accounts.map((a) => a.id));
      expect(visibleIds.has(accountA.id)).toBe(true);
      expect(visibleIds.has(accountB.id)).toBe(true);

      const fromList = accounts.find((a) => a.id === accountA.id)!;
      expect(fromList.share).toBeDefined();
      expect(fromList.share!.isOwner).toBe(false);
      expect(fromList.share!.permission).toBe(SHARE_PERMISSIONS.write);
      expect(fromList.share!.accessSource).toBe(ACCESS_SOURCES.household);
    });

    it('per-resource share wins over household — accessSource=share and permission from per-resource', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

      // Per-resource share at read.
      const invitation = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        permission: SHARE_PERMISSIONS.read,
        raw: true,
      });
      await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
      });

      // Household membership at write — must not shadow the per-resource share.
      await seedHouseholdMembership({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        permission: SHARE_PERMISSIONS.write,
      });

      const accounts = (await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getAccounts(),
      })) as unknown as AccountListResponse;

      const matches = accounts.filter((a) => a.id === account.id);
      // No duplicate row even though both share sources match.
      expect(matches).toHaveLength(1);
      expect(matches[0]!.share!.permission).toBe(SHARE_PERMISSIONS.read);
      expect(matches[0]!.share!.accessSource).toBe(ACCESS_SOURCES.share);
    });

    it('redacts bank-link metadata on household-derived accounts (recipient view)', async () => {
      const account = await helpers.createAccount({ raw: true });
      await Accounts.update(
        {
          externalId: 'stable-hash-456',
          externalData: { iban: 'BE12345', ownerName: 'Owner', rawAccountData: { x: 1 } },
        },
        { where: { id: account.id } },
      );

      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
      await seedHouseholdMembership({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        permission: SHARE_PERMISSIONS.write,
      });

      const accounts = (await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getAccounts(),
      })) as unknown as AccountListResponse;

      const fromList = accounts.find((a) => a.id === account.id)!;
      expect(fromList.share!.isOwner).toBe(false);
      expect(fromList.externalId).toBeNull();
      expect(fromList.bankDataProviderConnectionId).toBeNull();
    });

    it('does not surface grantor accounts when the household share is pending (acceptedAt=null)', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

      await seedHouseholdMembership({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        permission: SHARE_PERMISSIONS.write,
        acceptedAt: null,
      });

      const accounts = (await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getAccounts(),
      })) as unknown as AccountListResponse;

      expect(accounts.find((a) => a.id === account.id)).toBeUndefined();
    });
  });

  describe('GET /share/shared-with-me', () => {
    it('returns the household membership row with resourceType=household and accessSource=household', async () => {
      // Use a freshly-created account to lift the primary test user id — there's no
      // global `appUser` reference exposed to test files.
      const ownerAccount = await helpers.createAccount({ raw: true });
      const ownerUserId = ownerAccount.userId;

      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

      await seedHouseholdMembership({
        ownerUserId,
        sharedWithUserId: recipientApp.id,
        permission: SHARE_PERMISSIONS.write,
      });

      const items = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.listSharedWithMe({ raw: true }),
      });
      const householdRow = items.find(
        (i) => i.resourceType === RESOURCE_TYPES.household && i.resourceId === String(ownerUserId),
      );
      expect(householdRow).toBeDefined();
      expect(householdRow!.accessSource).toBe(ACCESS_SOURCES.household);
      expect(householdRow!.permission).toBe(SHARE_PERMISSIONS.write);
      expect(householdRow!.owner.username).toBeTruthy();
    });

    it('per-resource shares report accessSource=share', async () => {
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const invitation = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
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
      const row = items.find((i) => i.resourceType === RESOURCE_TYPES.account && i.resourceId === String(account.id));
      expect(row).toBeDefined();
      expect(row!.accessSource).toBe(ACCESS_SOURCES.share);
    });
  });
});
