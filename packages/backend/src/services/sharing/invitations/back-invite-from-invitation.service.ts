import { HouseholdSharePermission, RESOURCE_TYPES, SHARE_INVITATION_STATUSES, SharePolicy } from '@bt/shared/types';
import { ConflictError, NotFoundError, ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import { connection } from '@models/index';
import ResourceShares from '@models/resource-shares.model';
import ShareInvitations from '@models/share-invitations.model';
import { withTransaction } from '@services/common/with-transaction';
import { assertUsersNotBaseCurrencyLocked } from '@services/currencies/base-currency-lock';
import { Op, QueryTypes } from 'sequelize';

import { getEmailForUser } from '../find-user-by-email.service';
import { createInvitation } from './create-invitation.service';

interface BackInviteFromInvitationParams {
  callerUserId: number;
  sourceInvitationId: string;
  permission: HouseholdSharePermission;
  policy?: SharePolicy | null;
}

/**
 * Reciprocal "share back" flow. Used after a recipient accepts a household invitation
 * and wants to share their own household with the inviter without typing the inviter's
 * email manually (which the frontend doesn't have on hand and which we don't want to
 * expose through the listing endpoint).
 *
 * Authorization is grounded in the durable `ResourceShares` row, not the invitation row:
 * the caller must have an accepted household membership from the inviter to qualify.
 * That covers the case where the invitation row was created against an unregistered
 * email (so `inviteeUserId` is null even after the caller signed up + accepted) and
 * keeps the source-of-truth aligned with how `canUserAccessResource` resolves grants.
 *
 * Delegates to `createInvitation` so currency-match, self-share, duplicate-pending,
 * recipient cap, and rate-limit checks all apply uniformly — this is just a thin
 * adapter that swaps the "invitee email" input for "back-invite the user from this
 * household I joined".
 */
const backInviteFromInvitationImpl = async ({
  callerUserId,
  sourceInvitationId,
  permission,
  policy,
}: BackInviteFromInvitationParams) => {
  const sourceInvitation = await ShareInvitations.findByPk(sourceInvitationId);
  if (!sourceInvitation) {
    throw new NotFoundError({ message: 'Invitation not found' });
  }

  if (sourceInvitation.resourceType !== RESOURCE_TYPES.household) {
    throw new ValidationError({ message: 'Back-invite is only supported for household invitations.' });
  }

  const inviterUserId = sourceInvitation.ownerUserId;

  // Serialize concurrent back-invites from the same recipient toward the same inviter so
  // the eligibility reads below cannot race past two parallel requests. Without the lock,
  // both requests can pass the reciprocal-share check before either commits and produce
  // duplicate pending invitations. Transaction-scoped — released on commit/rollback.
  await connection.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:scope), hashtext(:pair))', {
    replacements: {
      scope: 'share-back-invite',
      pair: `${callerUserId}:${inviterUserId}`,
    },
    type: QueryTypes.SELECT,
  });

  // The caller must actually be a member of the inviter's household. Anything else
  // is rejected as 404 to avoid leaking the existence of unrelated invitations.
  const acceptedMembership = await ResourceShares.findOne({
    where: {
      ownerUserId: inviterUserId,
      sharedWithUserId: callerUserId,
      resourceType: RESOURCE_TYPES.household,
      acceptedAt: { [Op.not]: null },
    },
  });
  if (!acceptedMembership) {
    throw new NotFoundError({ message: 'Invitation not found' });
  }

  // Refuse while either the caller or the inviter is mid base-currency migration. Sharing
  // a household back during a migration recreates the shared-account/mixed-base state
  // `changeBaseCurrencyImpl`'s share validation forbids. The route guard only inspects the
  // caller's lock, so the inviter's is checked here too.
  await assertUsersNotBaseCurrencyLocked({ requesterUserId: callerUserId, otherUserIds: [inviterUserId] });

  // Reject early when the reciprocal share already exists. createInvitation's duplicate
  // check fires at accept time, not at create time, so without this guard a redundant
  // back-invite would happily create another pending row that the inviter could never
  // accept (their accepted-share row blocks it). Catch it here for a clean 409 instead.
  const reciprocalAcceptedShare = await ResourceShares.findOne({
    where: {
      ownerUserId: callerUserId,
      sharedWithUserId: inviterUserId,
      resourceType: RESOURCE_TYPES.household,
      acceptedAt: { [Op.not]: null },
    },
  });
  if (reciprocalAcceptedShare) {
    throw new ConflictError({ message: 'You already share your household with this user.' });
  }

  // Also block when a pending back-invite already exists in this direction. createInvitation
  // counts pending invitations per (owner, resource, *) but does not dedupe per-invitee, so
  // repeat clicks on the dialog would otherwise produce N pending rows the inviter could
  // accept just one of — not a correctness break, but a UX leak (spam) and a count drift.
  const pendingReciprocalInvitation = await ShareInvitations.findOne({
    where: {
      ownerUserId: callerUserId,
      inviteeUserId: inviterUserId,
      resourceType: RESOURCE_TYPES.household,
      status: SHARE_INVITATION_STATUSES.pending,
    },
  });
  if (pendingReciprocalInvitation) {
    throw new ConflictError({ message: 'You have already sent a back-invite to this user.' });
  }

  const inviterEmail = await getEmailForUser({ userId: inviterUserId });
  if (!inviterEmail) {
    // Inviter row exists (the source invitation references it) but their auth-side
    // email could not be resolved. Surface a stable code so Sentry can group these
    // distinctly from generic 409s — getEmailForUser already logs the underlying
    // cause (orphaned auth row vs. missing authUserId), this annotates the caller.
    logger.error(
      {
        message: 'Could not resolve inviter email for back-invite',
        error: new Error(`getEmailForUser returned null for userId=${inviterUserId}`),
      },
      {
        code: 'SHARE_BACK_INVITE_INVITER_EMAIL_UNRESOLVED',
        callerUserId,
        inviterUserId,
        sourceInvitationId,
      },
    );
    throw new ConflictError({ message: 'Could not resolve the inviter to a deliverable email.' });
  }

  return createInvitation({
    ownerUserId: callerUserId,
    inviteeEmail: inviterEmail,
    resourceType: RESOURCE_TYPES.household,
    resourceId: String(callerUserId),
    permission,
    policy: policy ?? null,
  });
};

export const backInviteFromInvitation = withTransaction(backInviteFromInvitationImpl);
