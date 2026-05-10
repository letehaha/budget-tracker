import { SHARE_INVITATION_STATUSES, ShareInvitationModel } from '@bt/shared/types';
import { ConflictError, NotFoundError } from '@js/errors';
import ShareInvitations from '@models/share-invitations.model';
import { withTransaction } from '@services/common/with-transaction';

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

  return { invitation: invitation.toJSON() as ShareInvitationModel };
};

/**
 * Owner cancels a pending invitation. Sets `status=revoked` so subsequent accept attempts
 * on the token surface a clean "invitation no longer available" error (the existing
 * status guard in `acceptInvitation` already rejects non-pending). No notification — the
 * owner initiated the cancel themselves; the recipient's invitation card disappears once
 * they refetch.
 */
export const cancelInvitation = withTransaction(cancelInvitationImpl);
