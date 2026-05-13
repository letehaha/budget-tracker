import { SHARE_INVITATION_STATUSES, SHARING_LIMITS, ShareInvitationModel } from '@bt/shared/types';
import { ConflictError, NotFoundError } from '@js/errors';
import { logger } from '@js/utils/logger';
import ShareInvitations from '@models/share-invitations.model';
import Users from '@models/users.model';
import { withTransaction } from '@services/common/with-transaction';
import { resolveResourceName } from '@services/sharing/auth/can-user-access-resource.service';

import { notifyInvitationReceived } from '../share-notifications';
import { FALLBACK_OWNER_DISPLAY_NAME } from '../share-user-snapshot';
import { generateInvitationToken } from './generate-invitation-token';
import { sendInvitationEmail } from './share-invitation-email';

/**
 * Resend lifecycle (per PRD F5):
 *
 *   - Owner-only.
 *   - Eligible from `pending`, `declined`, `expired`. Accepted/revoked are terminal.
 *   - **In-place** update: rotate token, reset `expiresAt`, set `status=pending`, bump
 *     `resendCount`, append now to `recentResendsAt` (rolling 24h window pruned first).
 *     Old token is invalidated implicitly because the column is `unique` and we overwrite
 *     it.
 *   - Rate limit: `SHARING_LIMITS.resendPerInviteeRateLimit` (count + windowMs).
 *
 * The resend re-emits the same in-app notification + email as the initial send (a fresh
 * actionable card is the point of resending) — but only when the invitee is a registered
 * user. Unresolved emails get the row update and nothing else, same shape as create-invitation.
 */

const RESEND_ELIGIBLE_STATUSES = [
  SHARE_INVITATION_STATUSES.pending,
  SHARE_INVITATION_STATUSES.declined,
  SHARE_INVITATION_STATUSES.expired,
] as const;

interface ResendInvitationParams {
  invitationId: string;
  ownerUserId: number;
}

/**
 * Two carry-overs from the in-transaction phase to the post-commit phase: the
 * `ownerDisplayName` so we don't re-query `Users` after commit (a missing-row would also
 * already have been logged in-tx), and `resourceName` because the model row no longer
 * carries it once we've left the impl.
 */
interface ResendInvitationImplResult {
  invitation: ShareInvitationModel;
  inviteeEmail: string;
  inviteeUserId: number | null;
  resourceName: string;
  ownerDisplayName: string;
}

interface ResendInvitationResult {
  invitation: ShareInvitationModel;
  /**
   * `false` when the post-commit email send failed (Resend down, network error, etc.) so
   * the caller can surface a "we updated the invitation but couldn't send the email" hint.
   * `true` when the invitee is unregistered (no email to send) or the email was accepted
   * by Resend.
   */
  emailDelivered: boolean;
}

const pruneToWindow = (timestamps: string[], windowMs: number, now: number): string[] => {
  const cutoff = now - windowMs;
  return timestamps.filter((iso) => {
    const t = Date.parse(iso);
    return Number.isFinite(t) && t >= cutoff;
  });
};

const resendInvitationImpl = async (params: ResendInvitationParams): Promise<ResendInvitationImplResult> => {
  const { invitationId, ownerUserId } = params;

  const invitation = await ShareInvitations.findByPk(invitationId);
  if (!invitation) {
    throw new NotFoundError({ message: 'Invitation not found' });
  }

  // Owner-mismatch returns 404 (not 403) — never confirm existence to a non-owner. This
  // matches the recipient-side identity-binding pattern on the accept/decline endpoints.
  if (invitation.ownerUserId !== ownerUserId) {
    throw new NotFoundError({ message: 'Invitation not found' });
  }

  if (!RESEND_ELIGIBLE_STATUSES.includes(invitation.status as (typeof RESEND_ELIGIBLE_STATUSES)[number])) {
    throw new ConflictError({
      message: `Invitation is ${invitation.status} and can no longer be resent.`,
    });
  }

  const now = Date.now();
  const { count: limitCount, windowMs } = SHARING_LIMITS.resendPerInviteeRateLimit;
  const trimmed = pruneToWindow(invitation.recentResendsAt, windowMs, now);
  if (trimmed.length >= limitCount) {
    // Surface a structured, hint-rich message — the frontend likely wants to show the
    // owner *when* their next resend slot opens up. Caller can derive that from the
    // earliest entry in the window.
    throw new ConflictError({
      message: `Resend rate limit reached (${limitCount} per 24h). Try again later.`,
    });
  }

  const resourceName =
    (await resolveResourceName({
      resourceType: invitation.resourceType,
      resourceId: invitation.resourceId,
    })) ?? 'Shared resource';

  // Resolve the owner once. Used in-tx for the notification snapshot AND post-commit for
  // the email display name (passed back via the impl result). Single source of truth for
  // the missing-owner case keeps the Sentry signal coherent (one stable code per resend,
  // not two divergent ones for notification + email).
  const owner = await Users.findByPk(ownerUserId);
  if (owner === null) {
    logger.error(
      {
        message: 'Owner not found while resending share invitation',
        error: new Error(`Users.findByPk returned null for ownerUserId=${ownerUserId}`),
      },
      {
        code: 'SHARE_OWNER_USER_MISSING_FOR_RESEND',
        ownerUserId,
        invitationId: invitation.id,
      },
    );
  }
  const ownerDisplayName = owner?.username ?? FALLBACK_OWNER_DISPLAY_NAME;

  const newToken = generateInvitationToken();
  const newExpiresAt = new Date(now + SHARING_LIMITS.invitationExpirationDays * 24 * 60 * 60 * 1000);
  trimmed.push(new Date(now).toISOString());

  invitation.token = newToken;
  invitation.expiresAt = newExpiresAt;
  invitation.status = SHARE_INVITATION_STATUSES.pending;
  invitation.resendCount += 1;
  invitation.recentResendsAt = trimmed;
  // Reset the relevant terminal-state markers — the row is once again a live pending
  // invitation, not a record of a previous decline/expiry. Lifecycle dates that *did*
  // happen are preserved as audit history if we ever stamp them; for now the only
  // pre-resend states with a stamped timestamp are accepted (ineligible to resend) and
  // declined (declinedAt). Reset declinedAt so a downstream reader doesn't see "pending
  // but declinedAt is still set".
  invitation.declinedAt = null;
  await invitation.save();

  // In-app notification fires only when invitee is a known user (resolved at create time).
  // The owner-missing case is already logged above — skip the snapshot rather than wedge
  // a sentinel into the notification payload.
  if (invitation.inviteeUserId !== null && owner !== null) {
    await notifyInvitationReceived({
      inviteeUserId: invitation.inviteeUserId,
      owner,
      invitation: {
        invitationId: invitation.id,
        token: invitation.token,
        resourceType: invitation.resourceType,
        resourceId: invitation.resourceId,
        resourceName,
        permission: invitation.permission,
        expiresAt: newExpiresAt,
      },
    });
  }

  return {
    invitation: invitation.toJSON() as ShareInvitationModel,
    inviteeEmail: invitation.inviteeEmail,
    inviteeUserId: invitation.inviteeUserId,
    resourceName,
    ownerDisplayName,
  };
};

export const resendInvitation = async (params: ResendInvitationParams): Promise<ResendInvitationResult> => {
  const result = await withTransaction(resendInvitationImpl)(params);

  // No invitee resolved → no email to send. The DB row + window slot were still updated;
  // for callers, that counts as "delivered to the only audience that exists" so the flag
  // stays true and the frontend doesn't surface a misleading warning.
  if (result.inviteeUserId === null) {
    return { invitation: result.invitation, emailDelivered: true };
  }

  // Surface the email outcome to the caller — important because the rate-limit window
  // slot was already consumed in the impl, and a silent send failure would burn the
  // user's daily budget invisibly. `'skipped'` (Resend not configured in dev/test)
  // counts as delivered for the user-facing flag — there's no failure for them to see.
  const outcome = await sendInvitationEmail({
    toEmail: result.inviteeEmail,
    ownerDisplayName: result.ownerDisplayName,
    resourceType: result.invitation.resourceType,
    resourceName: result.resourceName,
    permission: result.invitation.permission,
    policy: result.invitation.policy,
    token: result.invitation.token,
    expiresAt: new Date(result.invitation.expiresAt),
  });

  return { invitation: result.invitation, emailDelivered: outcome.status !== 'failed' };
};
