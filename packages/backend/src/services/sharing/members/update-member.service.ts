import {
  RESOURCE_TYPES,
  ResourceShareModel,
  ResourceType,
  SHARE_PERMISSIONS,
  SharePermission,
  SharePolicy,
  TRANSACTIONS_WRITE_SCOPES,
} from '@bt/shared/types';
import { NotFoundError, ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import ResourceShares from '@models/resource-shares.model';
import Users from '@models/users.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op } from 'sequelize';

import { canUserAccessResource, resolveResourceName } from '../auth/can-user-access-resource.service';
import { notifyHouseholdPermissionChanged } from '../share-notifications';
import { formatHouseholdLabel } from '../sharing-utils';

interface UpdateMemberParams {
  callerUserId: number;
  resourceType: ResourceType;
  resourceId: string | number;
  /** App `Users.id` of the recipient whose membership is being updated. */
  memberUserId: number;
  permission?: SharePermission;
  policy?: SharePolicy | null;
}

/**
 * Normalises the policy block based on the (possibly new) permission. Read-only access
 * doesn't carry a policy — collapse it to `null`. Write/manage default to `'all'` when no
 * explicit scope is supplied, matching the create-invitation default. The caller already
 * validated that `policy.transactionsWriteScope` is a known enum value at the controller.
 */
const normalizePolicyForPermission = ({
  permission,
  incomingPolicy,
  existingPolicy,
}: {
  permission: SharePermission;
  incomingPolicy: SharePolicy | null | undefined;
  existingPolicy: SharePolicy | null;
}): SharePolicy | null => {
  if (permission === SHARE_PERMISSIONS.read) {
    return null;
  }
  // If caller didn't touch policy, keep the existing one (or fall back to `all`).
  if (incomingPolicy === undefined) {
    if (existingPolicy) return existingPolicy;
    return { transactionsWriteScope: TRANSACTIONS_WRITE_SCOPES.all };
  }
  const scope = incomingPolicy?.transactionsWriteScope ?? TRANSACTIONS_WRITE_SCOPES.all;
  return { transactionsWriteScope: scope };
};

const updateMemberImpl = async (params: UpdateMemberParams): Promise<{ share: ResourceShareModel }> => {
  const { callerUserId, resourceType, resourceId, memberUserId, permission, policy } = params;

  if (permission === undefined && policy === undefined) {
    throw new ValidationError({ message: 'Provide at least one of `permission` or `policy` to update.' });
  }

  // Manage gate: owner always passes, manage recipients pass, anyone else gets 404.
  const access = await canUserAccessResource({
    userId: callerUserId,
    resourceType,
    resourceId,
    requiredPermission: SHARE_PERMISSIONS.manage,
  });
  if (!access.granted) {
    throw new NotFoundError({ message: 'Shared resource not found' });
  }

  // Owners can't be edited via this endpoint — their permission is implicit `manage` and
  // there's no `ResourceShares` row to mutate. Surface a clean validation error rather
  // than a confusing 404.
  if (memberUserId === access.ownerUserId) {
    throw new ValidationError({ message: 'Cannot modify the owner of a shared resource.' });
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

  const nextPermission = permission ?? share.permission;
  const nextPolicy = normalizePolicyForPermission({
    permission: nextPermission,
    incomingPolicy: policy,
    existingPolicy: share.policy,
  });

  const permissionChanged = nextPermission !== share.permission;
  const policyChanged = !areShareEquivalentPolicies(share.policy, nextPolicy);
  share.permission = nextPermission;
  share.policy = nextPolicy;
  await share.save();

  // Surface the membership-level change so household members see the new ceiling in their
  // notification center. Only fires for household rows — per-resource shares don't have a
  // user-facing surface for permission changes (yet); revisit when we add one. Fires on
  // policy changes too, since the recipient's writeScope is user-visible.
  if ((permissionChanged || policyChanged) && resourceType === RESOURCE_TYPES.household) {
    const owner = await Users.findByPk(access.ownerUserId);
    if (!owner) {
      // Skip the notification — sending one with a null owner produces broken copy
      // ("Your access to 's household ...") and gives the member no actionable info.
      // Bail rather than silently broadcast garbage.
      logger.error(
        {
          message: 'Owner row missing when emitting household-permission-changed notification',
          error: new Error(`Users.findByPk returned null for ownerUserId=${access.ownerUserId}`),
        },
        { code: 'HOUSEHOLD_PERMISSION_OWNER_USER_MISSING', ownerUserId: access.ownerUserId, shareId: share.id },
      );
      return { share: share.toJSON() as ResourceShareModel };
    }
    const resourceName =
      (await resolveResourceName({ resourceType, resourceId: resourceIdStr })) ?? formatHouseholdLabel(owner.username);
    await notifyHouseholdPermissionChanged({
      recipientUserId: memberUserId,
      owner,
      shareId: share.id,
      resource: { type: resourceType, id: resourceIdStr, name: resourceName },
      permission: nextPermission,
      policy: nextPolicy,
    });
  }

  return { share: share.toJSON() as ResourceShareModel };
};

const areShareEquivalentPolicies = (a: SharePolicy | null, b: SharePolicy | null): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.transactionsWriteScope === b.transactionsWriteScope;
};

/**
 * Owner / manage-recipient updates a member's permission and/or policy on a shared
 * resource. Read collapses the policy to `null`; write/manage materialise the
 * `transactionsWriteScope` default when not explicitly supplied.
 */
export const updateMember = withTransaction(updateMemberImpl);
