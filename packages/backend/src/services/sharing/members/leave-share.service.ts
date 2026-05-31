import type { ResourceType } from '@bt/shared/types';
import { RESOURCE_TYPES } from '@bt/shared/types';
import { NotFoundError, UnexpectedError } from '@js/errors';
import { logger } from '@js/utils/logger';
import ResourceShares from '@models/resource-shares.model';
import Users from '@models/users.model';
import { Op } from '@sequelize/core';
import { withTransaction } from '@services/common/with-transaction';

import { resolveResourceName } from '../auth/can-user-access-resource.service';
import { sweepRecipientBudgetTransactions } from '../cleanup/cleanup-budget-shares.service';
import { getEmailForUser } from '../find-user-by-email.service';
import { convertCrossUserTransfersToOutOfWallet } from '../household/convert-cross-user-transfers.service';
import { LIFECYCLE_NOTIFIERS } from '../share-notifications';
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

  // Pre-validate identity rows BEFORE the destroy commits. The recipient is the
  // authenticated caller — a null here is a data-integrity violation that must abort
  // the leave with a clean 500 (auth middleware guarantees the row exists). Owner-row
  // missing is also reported but doesn't abort: the destroy + post-commit fan-out still
  // need to run so the recipient isn't stuck holding an unleaveable share.
  const sharedShareId = share.id;
  const sharedPermission = share.permission;
  const ownerUserId = share.ownerUserId;

  const [owner, recipient] = await Promise.all([Users.findByPk(ownerUserId), Users.findByPk(callerUserId)]);

  if (!recipient) {
    logger.error(
      {
        message: 'Authenticated caller has no Users row when leaving share',
        error: new Error(`Users.findByPk returned null for callerUserId=${callerUserId}`),
      },
      { code: 'SHARE_LEAVE_RECIPIENT_USER_MISSING', callerUserId, shareId: sharedShareId },
    );
    throw new UnexpectedError({ message: 'Unable to leave share' });
  }

  if (!owner) {
    logger.error(
      {
        message: 'Owner Users row missing when leaving share',
        error: new Error(`Users.findByPk returned null for ownerUserId=${ownerUserId}`),
      },
      { code: 'SHARE_LEAVE_OWNER_USER_MISSING', ownerUserId, shareId: sharedShareId },
    );
  }

  await share.destroy();

  // Household leave severs the broad write-grant between the two users — any
  // transfer pair that crossed the boundary must stop pointing at a partner the
  // leaving member can no longer reach. Conversion runs inside this withTransaction
  // so a failure rolls the whole leave back rather than leaving a half-broken pair.
  if (resourceType === RESOURCE_TYPES.household) {
    await convertCrossUserTransfersToOutOfWallet({
      userIdA: ownerUserId,
      userIdB: callerUserId,
    });
  }

  // Budget leave: sweep this recipient's attached `BudgetTransactions` rows so the
  // budget's contents stay consistent with who currently has access. Mirrors the
  // revoke-member sweep.
  if (resourceType === RESOURCE_TYPES.budget) {
    await sweepRecipientBudgetTransactions({
      budgetId: resourceIdStr,
      recipientUserId: callerUserId,
    });
  }

  const notify = LIFECYCLE_NOTIFIERS.shareLeft[resourceType];
  await notify({
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

  const ownerEmail = await getEmailForUser({ userId: ownerUserId });

  return {
    ownerEmail,
    recipientDisplayName: recipient.username,
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
