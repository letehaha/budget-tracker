import { ResourceType } from '@bt/shared/types';
import { NotFoundError } from '@js/errors';
import { logger } from '@js/utils/logger';
import ResourceShares from '@models/resource-shares.model';
import Users from '@models/users.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op } from 'sequelize';

import { resolveResourceName } from '../auth/can-user-access-resource.service';
import { getEmailForUser } from '../find-user-by-email.service';
import { notifyShareLeft } from '../share-notifications';
import { sendShareLeftEmail } from './share-membership-emails';

interface LeaveShareParams {
  callerUserId: number;
  resourceType: ResourceType;
  resourceId: string | number;
}

interface LeaveShareImplResult {
  ownerEmail: string | null;
  recipientDisplayName: string;
  resourceType: ResourceType;
  resourceName: string;
}

const leaveShareImpl = async (params: LeaveShareParams): Promise<LeaveShareImplResult> => {
  const { callerUserId, resourceType, resourceId } = params;
  const resourceIdStr = String(resourceId);

  // Lookup goes straight to the share row — there's no need to gate this through
  // `canUserAccessResource`. Owners have no row, so they fall through 404 naturally.
  // Pending invitations have no `acceptedAt` and don't surface here either; recipients
  // who declined never had a row.
  const share = await ResourceShares.findOne({
    where: {
      sharedWithUserId: callerUserId,
      resourceType,
      resourceId: resourceIdStr,
      acceptedAt: { [Op.not]: null },
    },
  });
  if (!share) {
    throw new NotFoundError({ message: 'Shared resource not found' });
  }

  const resourceName = (await resolveResourceName({ resourceType, resourceId: resourceIdStr })) ?? 'Shared resource';

  const [owner, recipient] = await Promise.all([Users.findByPk(share.ownerUserId), Users.findByPk(callerUserId)]);

  const sharedShareId = share.id;
  const sharedPermission = share.permission;
  const ownerUserId = share.ownerUserId;

  await share.destroy();

  await notifyShareLeft({
    ownerUserId,
    recipient,
    shareId: sharedShareId,
    resource: {
      type: resourceType,
      id: resourceIdStr,
      name: resourceName,
    },
    permission: sharedPermission,
  });

  if (!owner || !recipient) {
    logger.error(
      {
        message: 'User row missing when leaving share',
        error: new Error(`Users.findByPk returned null (ownerMissing=${!owner}, recipientMissing=${!recipient})`),
      },
      {
        code: 'SHARE_LEAVE_USER_MISSING',
        ownerUserId,
        callerUserId,
        shareId: sharedShareId,
      },
    );
  }

  const ownerEmail = await getEmailForUser({ userId: ownerUserId });

  return {
    ownerEmail,
    recipientDisplayName: recipient?.username ?? 'A MoneyMatter user',
    resourceType,
    resourceName,
  };
};

/**
 * Recipient voluntarily leaves an accepted share. Owner-only resources (no recipient row)
 * 404 cleanly. Sends the owner an in-app `share_left` notification (in-transaction) and
 * a best-effort email (post-commit), mirroring the revoke flow.
 */
export const leaveShare = async (params: LeaveShareParams): Promise<void> => {
  const result = await withTransaction(leaveShareImpl)(params);

  if (result.ownerEmail) {
    await sendShareLeftEmail({
      toEmail: result.ownerEmail,
      recipientDisplayName: result.recipientDisplayName,
      resourceType: result.resourceType,
      resourceName: result.resourceName,
    });
  }
};
