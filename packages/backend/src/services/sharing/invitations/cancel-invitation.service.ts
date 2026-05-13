import {
  NOTIFICATION_STATUSES,
  NOTIFICATION_TYPES,
  SHARE_INVITATION_STATUSES,
  ShareInvitationModel,
} from '@bt/shared/types';
import { ConflictError, NotFoundError } from '@js/errors';
import Notifications from '@models/notifications.model';
import ShareInvitations from '@models/share-invitations.model';
import { withTransaction } from '@services/common/with-transaction';
import { Sequelize } from 'sequelize';

interface CancelInvitationParams {
  invitationId: string;
  ownerUserId: number;
}

const cancelInvitationImpl = async (params: CancelInvitationParams): Promise<{ invitation: ShareInvitationModel }> => {
  const { invitationId, ownerUserId } = params;

  const invitation = await ShareInvitations.findByPk(invitationId);
  if (!invitation) {
    throw new NotFoundError({ message: 'Invitation not found' });
  }
  if (invitation.ownerUserId !== ownerUserId) {
    // Owner-mismatch returns 404 — non-owners must not be able to confirm/deny existence.
    throw new NotFoundError({ message: 'Invitation not found' });
  }

  if (invitation.status !== SHARE_INVITATION_STATUSES.pending) {
    // Cancel only makes sense from `pending` — accepted/declined/expired/revoked are all
    // already terminal. Surface the current status so the frontend can re-render the row.
    throw new ConflictError({
      message: `Invitation is ${invitation.status} and can no longer be cancelled.`,
    });
  }

  invitation.status = SHARE_INVITATION_STATUSES.revoked;
  invitation.revokedAt = new Date();
  await invitation.save();

  // Dismiss the matching `share_invitation_received` notification so the invitee's
  // bell doesn't keep advertising a deep-link to an accept page that now 409s. Phase 1
  // has no dedicated `share_invitation_cancelled` notification type, but the existing
  // dismiss machinery already de-counts the bell badge + hides the entry from the
  // default fetch (status='unread' / 'read' only). JSONB key match scopes the dismiss
  // to this exact invitation; other notification types and other invitations untouched.
  // Pattern follows the codebase's `Sequelize.where(Sequelize.literal('"col"->>...'))`
  // idiom (see `walutomat.provider.ts`, `enablebanking.provider.ts`).
  await Notifications.update(
    { status: NOTIFICATION_STATUSES.dismissed },
    {
      where: Sequelize.and(
        { type: NOTIFICATION_TYPES.shareInvitationReceived },
        Sequelize.where(Sequelize.literal(`"payload"->>'invitationId'`), invitationId),
      ),
    },
  );

  return { invitation: invitation.toJSON() as ShareInvitationModel };
};

/**
 * Owner cancels a pending invitation. Sets `status=revoked` so subsequent accept attempts
 * on the token surface a clean "invitation no longer available" error (the existing
 * status guard in `acceptInvitation` already rejects non-pending), and dismisses the
 * matching in-app `share_invitation_received` notification so the invitee's bell stops
 * advertising a deep-link to an accept page that no longer works. A dedicated
 * `share_invitation_cancelled` notification type would be cleaner UX (mirroring
 * `share_revoked` for accepted shares) but is out of scope for Phase 1 — see PRD F13.
 */
export const cancelInvitation = withTransaction(cancelInvitationImpl);
