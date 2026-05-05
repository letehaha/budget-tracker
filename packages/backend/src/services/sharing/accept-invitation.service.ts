import {
  API_ERROR_CODES,
  ResourceShareModel,
  SHARE_INVITATION_STATUSES,
  SHARING_LIMITS,
  ShareInvitationModel,
} from '@bt/shared/types';
import { ConflictError, NotFoundError, ValidationError } from '@js/errors';
import { connection } from '@models/index';
import ResourceShares from '@models/resource-shares.model';
import ShareInvitations from '@models/share-invitations.model';
import { getBaseCurrency } from '@models/users-currencies.model';
import Users from '@models/users.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op, QueryTypes } from 'sequelize';

import { resolveResourceName } from './can-user-access-resource.service';
import { getEmailForUser } from './find-user-by-email.service';
import { notifyInvitationAccepted } from './share-notifications';

interface AcceptInvitationResult {
  invitation: ShareInvitationModel;
  share: ResourceShareModel;
}

/**
 * Verifies that the logged-in user is the rightful recipient of this invitation. Returns
 * `true` when the invitation should be bound to `userId` on accept (only relevant when the
 * invitation was sent to an unregistered email and the recipient has now signed up).
 *
 * Throws 404 (masked) on any mismatch — we never want to confirm/deny token existence to
 * a non-recipient.
 */
const verifyRecipientAndComputeBinding = async ({
  invitation,
  userId,
}: {
  invitation: ShareInvitations;
  userId: number;
}): Promise<{ shouldBindUserId: boolean }> => {
  if (invitation.inviteeUserId !== null) {
    if (invitation.inviteeUserId !== userId) {
      throw new NotFoundError({ message: 'Invitation not found' });
    }
    return { shouldBindUserId: false };
  }

  // Unresolved invitation — fall back to email match against the caller's auth email.
  const callerEmail = await getEmailForUser({ userId });
  if (!callerEmail) {
    throw new NotFoundError({ message: 'Invitation not found' });
  }
  if (callerEmail.toLowerCase() !== invitation.inviteeEmail.toLowerCase()) {
    throw new NotFoundError({ message: 'Invitation not found' });
  }
  return { shouldBindUserId: true };
};

const acceptImpl = async ({ token, userId }: { token: string; userId: number }): Promise<AcceptInvitationResult> => {
  const invitation = await ShareInvitations.findOne({ where: { token } });
  if (!invitation) {
    throw new NotFoundError({ message: 'Invitation not found' });
  }

  const { shouldBindUserId } = await verifyRecipientAndComputeBinding({ invitation, userId });

  // Defensive self-share check — prevents the edge case where an owner sent an invite to
  // an email that later turns out to belong to themselves (or where they sign up with a
  // matching email after sending). Send-time only catches this when the email was already
  // resolved to the owner's own user.
  if (invitation.ownerUserId === userId) {
    throw new ValidationError({ message: 'You cannot accept an invitation you sent yourself.' });
  }

  if (invitation.status !== SHARE_INVITATION_STATUSES.pending) {
    throw new ConflictError({
      message: `Invitation is ${invitation.status} and can no longer be accepted.`,
    });
  }

  if (invitation.expiresAt.getTime() <= Date.now()) {
    // Status stays `pending` in the DB until the daily expiration cron sweeps it (per PRD
    // F5 — cron is the canonical source for expiration). We can't update it here because
    // the surrounding transaction rolls back when we throw.
    throw new ConflictError({ message: 'This invitation has expired.' });
  }

  const resourceName = await resolveResourceName({
    resourceType: invitation.resourceType,
    resourceId: invitation.resourceId,
  });
  if (!resourceName) {
    throw new NotFoundError({ message: 'Shared resource is no longer available' });
  }

  // Currency check compares the recipient's base to the *owner's* base — not the
  // account's currency. The account's currency is unrelated; what matters is that both
  // users' refAmount aggregates line up (per PRD F10). An owner can have a USD account
  // even if their base currency is AED — the share is fine as long as the recipient's
  // base is also AED.
  const [ownerBaseCurrency, inviteeBaseCurrency] = await Promise.all([
    getBaseCurrency({ userId: invitation.ownerUserId }),
    getBaseCurrency({ userId }),
  ]);
  if (!ownerBaseCurrency) {
    // Defensive — an owner without a base currency shouldn't be able to share.
    throw new NotFoundError({ message: 'Shared resource is no longer available' });
  }
  if (!inviteeBaseCurrency || inviteeBaseCurrency.currencyCode !== ownerBaseCurrency.currencyCode) {
    // Structured error so the frontend can surface a "change base currency to X" CTA.
    throw new ValidationError({
      code: API_ERROR_CODES.shareCurrencyMismatch,
      message: `Your base currency must be ${ownerBaseCurrency.currencyCode} to accept this invitation.`,
      details: { expectedCurrency: ownerBaseCurrency.currencyCode },
    });
  }

  // Idempotent path: if the recipient already has an accepted share (e.g., from a prior
  // invitation), don't try to insert a duplicate row — mark this invitation accepted and
  // return the existing share. Avoids hitting the unique constraint on
  // (sharedWithUserId, resourceType, resourceId) and gives the user a coherent terminal state.
  const existingShare = await ResourceShares.findOne({
    where: {
      sharedWithUserId: userId,
      resourceType: invitation.resourceType,
      resourceId: invitation.resourceId,
    },
  });

  // Recipient cap is also re-checked here, not just at send-time. Multiple pending
  // invitations are allowed per resource (see F11), so without an accept-side cap two
  // recipients racing to accept could both win and exceed the cap. Existing-share path
  // skips this check — the recipient already has a slot, accepting again is idempotent.
  if (!existingShare) {
    // Serialize accept on (resourceType, resourceId) so concurrent recipients can't both
    // pass the count check below. The unique constraint only blocks same-recipient
    // duplicates; without this lock two different recipients could both insert and exceed
    // the cap. Transaction-scoped (`pg_advisory_xact_lock`) — released automatically on
    // commit/rollback. CLS picks up the surrounding transaction from `withTransaction`.
    await connection.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:resourceType), hashtext(:resourceId))', {
      replacements: {
        resourceType: invitation.resourceType,
        resourceId: invitation.resourceId,
      },
      type: QueryTypes.SELECT,
    });

    const acceptedCount = await ResourceShares.count({
      where: {
        resourceType: invitation.resourceType,
        resourceId: invitation.resourceId,
        acceptedAt: { [Op.not]: null },
      },
    });
    if (acceptedCount >= SHARING_LIMITS.maxRecipientsPerResource) {
      throw new ConflictError({
        message: `This resource is full — the owner has reached the maximum of ${SHARING_LIMITS.maxRecipientsPerResource} active recipient(s).`,
      });
    }
  }

  const acceptedAt = new Date();
  const share =
    existingShare ??
    (await ResourceShares.create({
      ownerUserId: invitation.ownerUserId,
      sharedWithUserId: userId,
      resourceType: invitation.resourceType,
      resourceId: invitation.resourceId,
      permission: invitation.permission,
      policy: invitation.policy,
      acceptedAt,
    }));

  invitation.status = SHARE_INVITATION_STATUSES.accepted;
  invitation.acceptedAt = acceptedAt;
  if (shouldBindUserId) {
    invitation.inviteeUserId = userId;
  }
  await invitation.save();

  // Notify the owner. We need both Users rows for the snapshot — the recipient is `this`
  // user and the owner is the receiver of the notification.
  const recipient = await Users.findByPk(userId);
  if (recipient) {
    await notifyInvitationAccepted({
      ownerUserId: invitation.ownerUserId,
      recipient,
      shareId: share.id,
      invitationId: invitation.id,
      resource: {
        type: invitation.resourceType,
        id: invitation.resourceId,
        name: resourceName,
      },
      permission: invitation.permission,
    });
  }

  return {
    invitation: invitation.toJSON() as ShareInvitationModel,
    share: share.toJSON() as ResourceShareModel,
  };
};

export const acceptInvitation = withTransaction(acceptImpl);
