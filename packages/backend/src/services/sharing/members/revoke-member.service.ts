import { ResourceType, SHARE_PERMISSIONS } from '@bt/shared/types';
import { NotFoundError, ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import ResourceShares from '@models/resource-shares.model';
import Users from '@models/users.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op } from 'sequelize';

import { canUserAccessResource, resolveResourceName } from '../auth/can-user-access-resource.service';
import { getEmailForUser } from '../find-user-by-email.service';
import { notifyShareRevoked } from '../share-notifications';
import { FALLBACK_OWNER_DISPLAY_NAME } from '../share-user-snapshot';
import { sendShareRevokedEmail } from './share-membership-emails';

interface RevokeMemberParams {
  callerUserId: number;
  resourceType: ResourceType;
  resourceId: string | number;
  memberUserId: number;
}

interface RevokeMemberImplResult {
  /** Email-side effect deferred to after the transaction commits. `null` when the recipient has no resolvable email (shouldn't happen, but stay defensive). */
  recipientEmail: string | null;
  ownerDisplayName: string;
  resourceType: ResourceType;
  resourceName: string;
}

const revokeMemberImpl = async (params: RevokeMemberParams): Promise<RevokeMemberImplResult> => {
  const { callerUserId, resourceType, resourceId, memberUserId } = params;

  const access = await canUserAccessResource({
    userId: callerUserId,
    resourceType,
    resourceId,
    requiredPermission: SHARE_PERMISSIONS.manage,
  });
  if (!access.granted) {
    throw new NotFoundError({ message: 'Shared resource not found' });
  }

  if (memberUserId === access.ownerUserId) {
    // Defensive: there's no ResourceShares row for the owner so this would just 404
    // anyway, but a clean validation error is friendlier and matches the update-member
    // surface.
    throw new ValidationError({ message: 'Cannot revoke the owner of a shared resource.' });
  }

  if (memberUserId === callerUserId) {
    // Manage recipients exit through `/shared-with-me/:type/:id/leave` — that path emits
    // the `share_left` notification to the owner. Forwarding self-revoke to the same code
    // path would emit `share_revoked` to themselves, which is the wrong UX.
    throw new ValidationError({
      message: 'Use the leave endpoint to remove your own access to a shared resource.',
    });
  }

  const resourceIdStr = String(resourceId);
  const share = await ResourceShares.findOne({
    where: {
      ownerUserId: access.ownerUserId,
      sharedWithUserId: memberUserId,
      resourceType,
      resourceId: resourceIdStr,
      acceptedAt: { [Op.not]: null },
    },
  });
  if (!share) {
    throw new NotFoundError({ message: 'Member not found on this shared resource.' });
  }

  const resourceName = (await resolveResourceName({ resourceType, resourceId: resourceIdStr })) ?? 'Shared resource';

  const [owner, recipient] = await Promise.all([Users.findByPk(access.ownerUserId), Users.findByPk(memberUserId)]);

  const sharedShareId = share.id;
  const sharedPermission = share.permission;

  await share.destroy();

  // In-app notification is in-transaction so it's atomic with the share deletion. Email is
  // deferred to after commit (returned to the wrapper) — same pattern as create-invitation.
  await notifyShareRevoked({
    recipientUserId: memberUserId,
    owner,
    shareId: sharedShareId,
    resource: {
      type: resourceType,
      id: resourceIdStr,
      name: resourceName,
    },
    permission: sharedPermission,
  });

  if (!owner || !recipient) {
    // Either the owner row or the recipient row is missing for an authenticated id —
    // shouldn't happen, but log so it doesn't disappear silently.
    logger.error(
      {
        message: 'User row missing when revoking share',
        error: new Error(`Users.findByPk returned null (ownerMissing=${!owner}, recipientMissing=${!recipient})`),
      },
      {
        code: 'SHARE_REVOKE_USER_MISSING',
        ownerUserId: access.ownerUserId,
        memberUserId,
        shareId: sharedShareId,
      },
    );
  }

  const recipientEmail = await getEmailForUser({ userId: memberUserId });

  return {
    recipientEmail,
    ownerDisplayName: owner?.username ?? FALLBACK_OWNER_DISPLAY_NAME,
    resourceType,
    resourceName,
  };
};

/**
 * Owner / manage-recipient revokes another recipient's accepted share. Sends the recipient
 * an in-app `share_revoked` notification (in-transaction) and a best-effort email
 * (post-commit). Self-revoke is rejected with a hint pointing at the leave endpoint.
 */
export const revokeMember = async (params: RevokeMemberParams): Promise<void> => {
  const result = await withTransaction(revokeMemberImpl)(params);

  if (result.recipientEmail) {
    await sendShareRevokedEmail({
      toEmail: result.recipientEmail,
      ownerDisplayName: result.ownerDisplayName,
      resourceType: result.resourceType,
      resourceName: result.resourceName,
    });
  }
};
