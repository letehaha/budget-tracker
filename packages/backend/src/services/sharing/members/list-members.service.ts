import { ResourceType, SHARE_PERMISSIONS, SharePermission, SharePolicy } from '@bt/shared/types';
import { NotFoundError } from '@js/errors';
import ResourceShares from '@models/resource-shares.model';
import Users from '@models/users.model';
import { Op } from 'sequelize';

import { canUserAccessResource, resolveResourceName } from '../auth/can-user-access-resource.service';

type ShareMemberRole = 'owner' | 'recipient';

export interface ShareMemberSnapshot {
  /**
   * `null` only when the underlying user row is gone (deleted account between accept and
   * list); the rest of the snapshot still renders thanks to the Unknown-user fallback.
   */
  user: { id: number; username: string; avatar: string | null };
  role: ShareMemberRole;
  /** Owner's effective permission is reported as `manage` to mirror `canUserAccessResource`. */
  permission: SharePermission;
  policy: SharePolicy | null;
  /** `null` for the owner; the share's `acceptedAt` for recipients. */
  acceptedAt: Date | null;
  /** `null` for the owner; the `ResourceShares.id` for recipients (callers use it for PATCH/DELETE). */
  shareId: string | null;
}

export interface ListMembersResult {
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  members: ShareMemberSnapshot[];
}

const userSnapshot = (user: Users | null | undefined, fallbackId: number): ShareMemberSnapshot['user'] => ({
  id: user?.id ?? fallbackId,
  username: user?.username ?? 'Unknown user',
  avatar: user?.avatar ?? null,
});

/**
 * Returns the active membership of a shared resource: the owner (always present) plus
 * every accepted recipient. Pending invitations are intentionally excluded — they live in
 * the existing `/share/invitations/sent` surface.
 *
 * Visible to anyone with `manage` permission on the resource (owner included). Anyone
 * else gets a 404 so we don't leak existence to non-members.
 */
export const listMembers = async ({
  userId,
  resourceType,
  resourceId,
}: {
  userId: number;
  resourceType: ResourceType;
  resourceId: string | number;
}): Promise<ListMembersResult> => {
  const access = await canUserAccessResource({
    userId,
    resourceType,
    resourceId,
    requiredPermission: SHARE_PERMISSIONS.manage,
  });
  if (!access.granted) {
    throw new NotFoundError({ message: 'Shared resource not found' });
  }

  const resourceIdStr = String(resourceId);
  const resourceName = await resolveResourceName({ resourceType, resourceId: resourceIdStr });
  if (resourceName === null) {
    // Defensive — `canUserAccessResource` already verified the resource exists, but if it
    // races against a deletion between the auth check and the name lookup, surface 404
    // rather than emit an empty-name members payload.
    throw new NotFoundError({ message: 'Shared resource not found' });
  }

  const shares = (await ResourceShares.findAll({
    where: {
      resourceType,
      resourceId: resourceIdStr,
      acceptedAt: { [Op.not]: null },
    },
    order: [['acceptedAt', 'ASC']],
  })) as ResourceShares[];

  const userIds = new Set<number>([access.ownerUserId]);
  for (const share of shares) userIds.add(share.sharedWithUserId);
  const users = await Users.findAll({ where: { id: { [Op.in]: Array.from(userIds) } } });
  const usersById = new Map(users.map((u) => [u.id, u]));

  const ownerEntry: ShareMemberSnapshot = {
    user: userSnapshot(usersById.get(access.ownerUserId), access.ownerUserId),
    role: 'owner',
    permission: SHARE_PERMISSIONS.manage,
    policy: null,
    acceptedAt: null,
    shareId: null,
  };

  const recipientEntries: ShareMemberSnapshot[] = shares.map((share) => ({
    user: userSnapshot(usersById.get(share.sharedWithUserId), share.sharedWithUserId),
    role: 'recipient',
    permission: share.permission,
    policy: share.policy,
    acceptedAt: share.acceptedAt,
    shareId: share.id,
  }));

  return {
    resourceType,
    resourceId: resourceIdStr,
    resourceName,
    members: [ownerEntry, ...recipientEntries],
  };
};
