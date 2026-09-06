import { ACCESS_SOURCES, RESOURCE_TYPES, SHARE_PERMISSIONS } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import ResourceShares from '@models/resource-shares.model';
import * as helpers from '@tests/helpers';
import { CustomResponse } from '@tests/helpers/common';

/**
 * `canUserAccessResource` resolves access by walking owner → per-resource share →
 * household-membership grant, returning an `accessSource` discriminator on the granted
 * result. These tests exercise the resolution-order matrix through the public
 * `GET /accounts/:id` endpoint (the closest HTTP surface to the service), because the
 * service itself is invoked transitively from almost every endpoint that reads a sharable
 * resource.
 *
 * Household membership rows are seeded by writing `ResourceShares` directly — they're a
 * deterministic precondition independent of the invitation flow. DB CHECK constraints
 * enforce the row shape so the seeded rows can't drift from production rows.
 */

type AccountResponse = { id: string; share?: { isOwner: boolean; permission: string; accessSource: string } };

const seedHouseholdMembership = async ({
  ownerUserId,
  sharedWithUserId,
  permission,
}: {
  ownerUserId: number;
  sharedWithUserId: number;
  permission: (typeof SHARE_PERMISSIONS)[keyof typeof SHARE_PERMISSIONS];
}) =>
  ResourceShares.create({
    ownerUserId,
    sharedWithUserId,
    resourceType: RESOURCE_TYPES.household,
    resourceId: String(ownerUserId),
    permission,
    acceptedAt: new Date(),
  });

const getAccountAsUser = async ({ cookies, accountId }: { cookies: string; accountId: string }) =>
  helpers.asUser({
    cookies,
    fn: () => helpers.getAccount({ id: accountId, raw: false }),
  });

describe('canUserAccessResource — household-membership resolution', () => {
  it('resolves household grants by permission and requires acceptance', async () => {
    const account = await helpers.createAccount({ raw: true });
    const householdWriteUser = await helpers.provisionSecondUserWithBaseCurrency();
    const householdReadUser = await helpers.provisionSecondUserWithBaseCurrency();
    const unacceptedUser = await helpers.provisionSecondUserWithBaseCurrency();
    const stranger = await helpers.provisionSecondUserWithBaseCurrency();

    await seedHouseholdMembership({
      ownerUserId: account.userId,
      sharedWithUserId: (await helpers.findAppUserByEmail({ email: householdWriteUser.email })).id,
      permission: SHARE_PERMISSIONS.write,
    });
    await seedHouseholdMembership({
      ownerUserId: account.userId,
      sharedWithUserId: (await helpers.findAppUserByEmail({ email: householdReadUser.email })).id,
      permission: SHARE_PERMISSIONS.read,
    });
    // Pending household row — acceptedAt: null mirrors the not-yet-accepted state.
    await ResourceShares.create({
      ownerUserId: account.userId,
      sharedWithUserId: (await helpers.findAppUserByEmail({ email: unacceptedUser.email })).id,
      resourceType: RESOURCE_TYPES.household,
      resourceId: String(account.userId),
      permission: SHARE_PERMISSIONS.write,
      acceptedAt: null,
    });

    const writeRes = (await getAccountAsUser({
      cookies: householdWriteUser.cookies,
      accountId: account.id,
    })) as unknown as CustomResponse<AccountResponse>;
    expect(writeRes.statusCode).toBe(200);
    expect(writeRes.body.response.id).toBe(account.id);
    expect(writeRes.body.response.share).toBeDefined();
    expect(writeRes.body.response.share!.isOwner).toBe(false);
    expect(writeRes.body.response.share!.permission).toBe(SHARE_PERMISSIONS.write);
    expect(writeRes.body.response.share!.accessSource).toBe(ACCESS_SOURCES.household);

    const readRes = (await getAccountAsUser({
      cookies: householdReadUser.cookies,
      accountId: account.id,
    })) as unknown as CustomResponse<AccountResponse>;
    expect(readRes.statusCode).toBe(200);
    expect(readRes.body.response.share!.permission).toBe(SHARE_PERMISSIONS.read);
    expect(readRes.body.response.share!.accessSource).toBe(ACCESS_SOURCES.household);

    const unacceptedRes = (await getAccountAsUser({
      cookies: unacceptedUser.cookies,
      accountId: account.id,
    })) as unknown as CustomResponse<AccountResponse | null>;
    expect(unacceptedRes.body.response).toBeNull();

    const strangerRes = (await getAccountAsUser({
      cookies: stranger.cookies,
      accountId: account.id,
    })) as unknown as CustomResponse<AccountResponse | null>;
    expect(strangerRes.body.response).toBeNull();
  }, 60_000);

  describe('per-resource precedence', () => {
    it('returns accessSource=share when caller has both a per-resource share and a household membership', async () => {
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

      // Household membership at write — should NOT shadow the per-resource share.
      await seedHouseholdMembership({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        permission: SHARE_PERMISSIONS.write,
      });

      const res = (await getAccountAsUser({
        cookies: recipient.cookies,
        accountId: account.id,
      })) as unknown as CustomResponse<AccountResponse>;

      expect(res.statusCode).toBe(200);
      expect(res.body.response.share!.permission).toBe(SHARE_PERMISSIONS.read);
      expect(res.body.response.share!.accessSource).toBe(ACCESS_SOURCES.share);
    });

    it('does not escalate via household when the per-resource share is below the required level', async () => {
      // Per-resource read share on an account the recipient otherwise has household-write
      // access to. Writing a transaction needs write — the per-resource read share wins
      // precedence and blocks the write, even though the household grant would suffice.
      const account = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

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
      await seedHouseholdMembership({
        ownerUserId: account.userId,
        sharedWithUserId: recipientApp.id,
        permission: SHARE_PERMISSIONS.write,
      });

      const createRes = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.createTransaction({
            payload: helpers.buildTransactionPayload({ accountId: account.id }),
            raw: false,
          }),
      });
      // Write blocked because per-resource is read; the resolver collapses to 404 (masked)
      // rather than falling through to household to escalate access.
      expect((createRes as unknown as { statusCode: number }).statusCode).toBe(404);
    });
  });

  describe('owner access', () => {
    it('returns accessSource=owner for the caller who owns the account', async () => {
      const account = await helpers.createAccount({ raw: true });

      const accounts = await helpers.getAccounts();
      const found = accounts.find((a) => a.id === account.id) as unknown as {
        share?: { isOwner: boolean; accessSource: string };
      };
      expect(found).toBeDefined();
      expect(found.share!.isOwner).toBe(true);
      expect(found.share!.accessSource).toBe(ACCESS_SOURCES.owner);
    });
  });
});
