import { SHARE_INVITATION_STATUSES, ShareInvitationModel } from '@bt/shared/types';
import { ConflictError, NotFoundError } from '@js/errors';
import { logger } from '@js/utils/logger';
import ShareInvitations from '@models/share-invitations.model';
import Users from '@models/users.model';
import { withTransaction } from '@services/common/with-transaction';

import { resolveResourceName } from '../auth/can-user-access-resource.service';
import { getEmailForUser } from '../find-user-by-email.service';
import { notifyInvitationDeclined } from '../share-notifications';

interface DeclineInvitationResult {
  invitation: ShareInvitationModel;
}

const declineImpl = async ({ token, userId }: { token: string; userId: number }): Promise<DeclineInvitationResult> => {
  const invitation = await ShareInvitations.findOne({ where: { token } });
  if (!invitation) {
    throw new NotFoundError({ message: 'Invitation not found' });
  }

  // Identity binding mirrors accept (see PRD F5 step 3): if the invitation has a stamped
  // user id, it must match the caller; otherwise the caller's auth email must match
  // `inviteeEmail`. Mismatches mask as 404.
  let shouldBindUserId = false;
  if (invitation.inviteeUserId !== null) {
    if (invitation.inviteeUserId !== userId) {
      throw new NotFoundError({ message: 'Invitation not found' });
    }
  } else {
    const callerEmail = await getEmailForUser({ userId });
    if (!callerEmail || callerEmail.toLowerCase() !== invitation.inviteeEmail.toLowerCase()) {
      throw new NotFoundError({ message: 'Invitation not found' });
    }
    shouldBindUserId = true;
  }

  if (invitation.status !== SHARE_INVITATION_STATUSES.pending) {
    throw new ConflictError({
      message: `Invitation is ${invitation.status} and can no longer be declined.`,
    });
  }

  // Expired invitations can't be declined either. Status stays `pending` until the cron
  // (PRD F5) sweeps it; we can't write inside this transaction because it rolls back.
  if (invitation.expiresAt.getTime() <= Date.now()) {
    throw new ConflictError({ message: 'This invitation has expired.' });
  }

  const declinedAt = new Date();
  invitation.status = SHARE_INVITATION_STATUSES.declined;
  invitation.declinedAt = declinedAt;
  if (shouldBindUserId) {
    invitation.inviteeUserId = userId;
  }
  await invitation.save();

  const recipient = await Users.findByPk(userId);
  if (!recipient) {
    // Authenticated user has no Users row — should never happen (auth middleware guarantees
    // it). The notification still goes out below with the snapshotUser sentinel fallback,
    // but we report so this doesn't disappear into "Unknown user" in the owner's UI.
    logger.error(
      {
        message: 'Authenticated user not found when emitting share-declined notification',
        error: new Error(`Users.findByPk returned null for userId=${userId}`),
      },
      { userId, invitationId: invitation.id },
    );
  }
  const resourceName =
    (await resolveResourceName({
      resourceType: invitation.resourceType,
      resourceId: invitation.resourceId,
    })) ?? 'Shared resource';

  await notifyInvitationDeclined({
    ownerUserId: invitation.ownerUserId,
    recipient,
    invitationId: invitation.id,
    resource: {
      type: invitation.resourceType,
      id: invitation.resourceId,
      name: resourceName,
    },
  });

  return { invitation: invitation.toJSON() as ShareInvitationModel };
};

export const declineInvitation = withTransaction(declineImpl);
