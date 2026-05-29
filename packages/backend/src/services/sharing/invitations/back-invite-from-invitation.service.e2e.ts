import {
  RESOURCE_TYPES,
  SHARE_INVITATION_STATUSES,
  SHARE_PERMISSIONS,
  TRANSACTIONS_WRITE_SCOPES,
} from '@bt/shared/types';
import { NONEXISTENT_ID } from '@common/lib/record-id-helpers';
import ShareInvitations from '@models/share-invitations.model';
import * as helpers from '@tests/helpers';
import { CustomResponse } from '@tests/helpers/common';
import { describe, expect, it } from 'vitest';

/**
 * Reciprocal "share back" endpoint.
 *
 * Verifies the back-invite-from-invitation flow that fires after a recipient accepts a
 * household invitation: the recipient should be able to invite the original sender back
 * to their own household without typing the inviter's email.
 *
 * Authorization is grounded in the recipient's accepted household membership (a real
 * `ResourceShares` row), not just the invitation row — that keeps the rule aligned with
 * how `canUserAccessResource` resolves grants and works whether or not the original
 * invitation had a resolved `inviteeUserId` at create time.
 */

describe('Back-invite from accepted household invitation', () => {
  it('mirrors the household share — caller can back-invite the original sender', async () => {
    // Primary test user (A) owns the household and invites B. B accepts.
    const ownerAccount = await helpers.createAccount({ raw: true });
    const ownerUserId = ownerAccount.userId;
    const recipient = await helpers.provisionSecondUserWithBaseCurrency();
    const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

    const inv = await helpers.createHouseholdInvitation({ ownerUserId, inviteeEmail: recipient.email });
    await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.acceptShareInvitation({ token: inv.token, raw: true }),
    });

    // B back-invites A. The endpoint creates a household invitation owned by B, targeting
    // A's email — resolved server-side from the source invitation's owner.
    const backInvite = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () =>
        helpers.backInviteFromShareInvitation({
          sourceInvitationId: inv.id,
          permission: SHARE_PERMISSIONS.write,
          raw: true,
        }),
    });

    expect(backInvite.resourceType).toBe(RESOURCE_TYPES.household);
    expect(backInvite.ownerUserId).toBe(recipientApp.id);
    expect(backInvite.resourceId).toBe(String(recipientApp.id));
    expect(backInvite.status).toBe(SHARE_INVITATION_STATUSES.pending);
    // emailDelivered surfaces from the create-invitation pipeline. true here covers both
    // "Resend accepted the email" and "no email configured in this env" — what we want to
    // pin down is that the field is present (a regression that drops the spread in the
    // controller would silently break the frontend's "delivery failed" toast).
    expect(backInvite.emailDelivered).toBe(true);

    // Persistence check — the back-invite row exists with the right shape.
    const stored = await ShareInvitations.findByPk(backInvite.id);
    expect(stored).not.toBeNull();
    expect(stored!.ownerUserId).toBe(recipientApp.id);
    expect(stored!.inviteeUserId).toBe(ownerUserId);
  });

  it('persists the policy passed in (write scope round-trips end-to-end)', async () => {
    // Policy is the load-bearing piece of household scope (own-only vs. all). A regression
    // that drops the policy on the way through back-invite would silently expand permissions.
    const ownerAccount = await helpers.createAccount({ raw: true });
    const recipient = await helpers.provisionSecondUserWithBaseCurrency();

    const inv = await helpers.createHouseholdInvitation({
      ownerUserId: ownerAccount.userId,
      inviteeEmail: recipient.email,
    });
    await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.acceptShareInvitation({ token: inv.token, raw: true }),
    });

    const backInvite = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () =>
        helpers.backInviteFromShareInvitation({
          sourceInvitationId: inv.id,
          permission: SHARE_PERMISSIONS.write,
          policy: { transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.own },
          raw: true,
        }),
    });

    const stored = await ShareInvitations.findByPk(backInvite.id);
    expect(stored).not.toBeNull();
    expect(stored!.policy).toEqual({ transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.own });
  });

  it('rejects when the source invitation is not a household type', async () => {
    // Per-resource share over an account: back-invite should reject as 422 — the flow
    // is household-only and the controller should surface this without confusing the
    // user with "not found".
    const ownerAccount = await helpers.createAccount({ raw: true });
    const recipient = await helpers.provisionSecondUserWithBaseCurrency();

    const accountInvite = await helpers.createShareInvitation({
      inviteeEmail: recipient.email,
      resourceType: RESOURCE_TYPES.account,
      resourceId: ownerAccount.id,
      permission: SHARE_PERMISSIONS.write,
      raw: true,
    });
    await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.acceptShareInvitation({ token: accountInvite.token, raw: true }),
    });

    const res = (await helpers.asUser({
      cookies: recipient.cookies,
      fn: () =>
        helpers.backInviteFromShareInvitation({
          sourceInvitationId: accountInvite.id,
          permission: SHARE_PERMISSIONS.write,
          raw: false,
        }),
    })) as unknown as CustomResponse<unknown>;

    expect(res.statusCode).toBe(422);
  });

  it('rejects when the caller never accepted the household (no membership row)', async () => {
    // Owner sends a household invite to a recipient who never accepts. A third user
    // attempts to back-invite using that invitation id. They have no accepted membership
    // → 404, indistinguishable from "not found" to avoid leaking the invitation's
    // existence to outsiders.
    const ownerAccount = await helpers.createAccount({ raw: true });
    const ownerUserId = ownerAccount.userId;
    const recipient = await helpers.provisionSecondUserWithBaseCurrency();
    const outsider = await helpers.provisionSecondUserWithBaseCurrency();

    const inv = await helpers.createHouseholdInvitation({ ownerUserId, inviteeEmail: recipient.email });
    // recipient never accepts.

    const res = (await helpers.asUser({
      cookies: outsider.cookies,
      fn: () =>
        helpers.backInviteFromShareInvitation({
          sourceInvitationId: inv.id,
          permission: SHARE_PERMISSIONS.write,
          raw: false,
        }),
    })) as unknown as CustomResponse<unknown>;

    expect(res.statusCode).toBe(404);
  });

  it('rejects with 404 when the source invitation id does not exist', async () => {
    const res = (await helpers.backInviteFromShareInvitation({
      sourceInvitationId: NONEXISTENT_ID,
      permission: SHARE_PERMISSIONS.write,
      raw: false,
    })) as unknown as CustomResponse<unknown>;

    expect(res.statusCode).toBe(404);
  });

  it('rejects when a reciprocal household share already exists between the two users', async () => {
    // A invites B → B accepts. B back-invites A and A accepts. A second back-invite
    // attempt from B should fail because the share already exists in the reciprocal
    // direction — the back-invite service's own reciprocalAcceptedShare guard rejects
    // it before delegating to createInvitation.
    const ownerAccount = await helpers.createAccount({ raw: true });
    const ownerUserId = ownerAccount.userId;
    const recipient = await helpers.provisionSecondUserWithBaseCurrency();

    const inv = await helpers.createHouseholdInvitation({ ownerUserId, inviteeEmail: recipient.email });
    await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.acceptShareInvitation({ token: inv.token, raw: true }),
    });

    const backInvite = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () =>
        helpers.backInviteFromShareInvitation({
          sourceInvitationId: inv.id,
          permission: SHARE_PERMISSIONS.write,
          raw: true,
        }),
    });

    // The default (primary) user accepts the back-invite — now both households are
    // reciprocally shared.
    await helpers.acceptShareInvitation({ token: backInvite.token, raw: true });

    // Second attempt should bounce.
    const res = (await helpers.asUser({
      cookies: recipient.cookies,
      fn: () =>
        helpers.backInviteFromShareInvitation({
          sourceInvitationId: inv.id,
          permission: SHARE_PERMISSIONS.write,
          raw: false,
        }),
    })) as unknown as CustomResponse<unknown>;

    // back-invite service's reciprocalAcceptedShare guard fires here — 409.
    expect(res.statusCode).toBe(409);

    // Pin down that no second back-invite row was leaked. A regression that creates the
    // row first and then throws (e.g. re-ordering the duplicate check after createInvitation)
    // would otherwise pass the status assertion above while leaving an orphan pending row.
    const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
    const backInviteCount = await ShareInvitations.count({
      where: {
        ownerUserId: recipientApp.id,
        inviteeUserId: ownerUserId,
        resourceType: RESOURCE_TYPES.household,
      },
    });
    expect(backInviteCount).toBe(1);
  });

  it('rejects when a pending back-invite already exists in the reciprocal direction', async () => {
    // B accepts A's household, then back-invites A. A hasn't accepted yet, so the back-invite
    // is still pending. A second back-invite attempt from B must bounce (409) — without this
    // guard, repeat clicks on the dialog would create N pending rows the inviter could pick
    // just one of (UX leak / spam).
    const ownerAccount = await helpers.createAccount({ raw: true });
    const ownerUserId = ownerAccount.userId;
    const recipient = await helpers.provisionSecondUserWithBaseCurrency();

    const inv = await helpers.createHouseholdInvitation({ ownerUserId, inviteeEmail: recipient.email });
    await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.acceptShareInvitation({ token: inv.token, raw: true }),
    });

    await helpers.asUser({
      cookies: recipient.cookies,
      fn: () =>
        helpers.backInviteFromShareInvitation({
          sourceInvitationId: inv.id,
          permission: SHARE_PERMISSIONS.write,
          raw: true,
        }),
    });
    // A has not accepted — the back-invite is still pending.

    const res = (await helpers.asUser({
      cookies: recipient.cookies,
      fn: () =>
        helpers.backInviteFromShareInvitation({
          sourceInvitationId: inv.id,
          permission: SHARE_PERMISSIONS.write,
          raw: false,
        }),
    })) as unknown as CustomResponse<unknown>;

    expect(res.statusCode).toBe(409);

    // Only one pending back-invite row should exist — the duplicate check ran before the
    // create, not after.
    const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
    const pendingCount = await ShareInvitations.count({
      where: {
        ownerUserId: recipientApp.id,
        inviteeUserId: ownerUserId,
        resourceType: RESOURCE_TYPES.household,
        status: SHARE_INVITATION_STATUSES.pending,
      },
    });
    expect(pendingCount).toBe(1);
  });

  describe('schema validation', () => {
    it('rejects with 422 when permission is `manage` (households never carry manage)', async () => {
      const ownerAccount = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const inv = await helpers.createHouseholdInvitation({
        ownerUserId: ownerAccount.userId,
        inviteeEmail: recipient.email,
      });
      await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: inv.token, raw: true }),
      });

      const res = (await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.backInviteFromShareInvitation({
            sourceInvitationId: inv.id,
            // `manage` is not a valid HouseholdSharePermission. The cast bypasses the
            // compile-time guard so we can verify the runtime guard (zod schema) fires.
            permission: 'manage' as never,
            raw: false,
          }),
      })) as unknown as CustomResponse<unknown>;

      expect(res.statusCode).toBe(422);
    });

    it('rejects with 422 when the source invitation id is not a UUID', async () => {
      const res = (await helpers.backInviteFromShareInvitation({
        sourceInvitationId: 'not-a-uuid',
        permission: SHARE_PERMISSIONS.write,
        raw: false,
      })) as unknown as CustomResponse<unknown>;

      expect(res.statusCode).toBe(422);
    });
  });

  describe('accept response carries canBackInvite gate', () => {
    it('returns canBackInvite=true on the first leg (no reciprocal share yet)', async () => {
      const ownerAccount = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const inv = await helpers.createHouseholdInvitation({
        ownerUserId: ownerAccount.userId,
        inviteeEmail: recipient.email,
      });

      const accepted = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: inv.token, raw: true }),
      });

      expect(accepted.canBackInvite).toBe(true);
    });

    it('returns canBackInvite=false on the second leg to break the prompt cycle', async () => {
      // A invites B → B accepts → B back-invites A → A accepts. The accept response on
      // A's side must signal `canBackInvite=false` so the dialog doesn't prompt A to
      // "share back" with B (A already shares their household with B by definition).
      const ownerAccount = await helpers.createAccount({ raw: true });
      const ownerUserId = ownerAccount.userId;
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();

      const inv = await helpers.createHouseholdInvitation({ ownerUserId, inviteeEmail: recipient.email });
      await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: inv.token, raw: true }),
      });

      const backInvite = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.backInviteFromShareInvitation({
            sourceInvitationId: inv.id,
            permission: SHARE_PERMISSIONS.write,
            raw: true,
          }),
      });

      const acceptedSecondLeg = await helpers.acceptShareInvitation({ token: backInvite.token, raw: true });
      expect(acceptedSecondLeg.canBackInvite).toBe(false);
    });

    it('returns canBackInvite=false for non-household accepts (account share)', async () => {
      // The flag is only meaningful for households. Per-resource accepts must always come
      // back as `false` so the frontend's prompt gate (which already ANDs on resourceType
      // defensively) stays aligned with the backend invariant.
      const ownerAccount = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();

      const accountInvite = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: ownerAccount.id,
        permission: SHARE_PERMISSIONS.write,
        raw: true,
      });

      const accepted = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: accountInvite.token, raw: true }),
      });

      expect(accepted.canBackInvite).toBe(false);
    });

    it('returns canBackInvite=false when a pending invitation already exists in the reciprocal direction', async () => {
      // A invites B → A→B pending. B independently invites A → B→A pending.
      // A then accepts B's invitation: canBackInvite must be false, because A already has
      // a pending invitation targeting B (the original A→B). Without this guard, the
      // accept dialog would prompt A to "share back" with B, and clicking it would 409 on
      // the new pending-reciprocal block in the back-invite service — bad UX.
      const ownerAccount = await helpers.createAccount({ raw: true });
      const ownerUserId = ownerAccount.userId;
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

      // A → B pending (default user is A).
      await helpers.createHouseholdInvitation({ ownerUserId, inviteeEmail: recipient.email });

      // B → A pending (a fresh independent invite, not a back-invite). Hardcoded primary
      // test user email matches the seeded auth row in setupIntegrationTests.ts; same
      // pattern as create-invitation.service.e2e.ts uses for self-invite checks.
      const reverseInvite = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.createHouseholdInvitation({
            ownerUserId: recipientApp.id,
            inviteeEmail: 'test1@test.local',
          }),
      });

      // A accepts B's invite — pending A→B already exists, so canBackInvite must be false.
      const accepted = await helpers.acceptShareInvitation({ token: reverseInvite.token, raw: true });
      expect(accepted.canBackInvite).toBe(false);
    });
  });
});
