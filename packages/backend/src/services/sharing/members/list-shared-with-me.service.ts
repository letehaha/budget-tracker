import type { ResourceType, SharePermission, SharePolicy, SharedWithMeAccessSource } from '@bt/shared/types';
import { ACCESS_SOURCES, RESOURCE_TYPES } from '@bt/shared/types';
import ResourceShares from '@models/resource-shares.model';
import Users from '@models/users.model';
import { Op } from '@sequelize/core';

import { resolveResourceName } from '../auth/can-user-access-resource.service';
import type { ShareUserSnapshot } from '../share-user-snapshot';
import { snapshotShareUser } from '../share-user-snapshot';

export interface SharedWithMeItem {
  shareId: string;
  resourceType: ResourceType;
  resourceId: string;
  /** May be `null` when the underlying resource was deleted but the share row hasn't been swept yet. */
  resourceName: string | null;
  permission: SharePermission;
  policy: SharePolicy | null;
  acceptedAt: Date;
  owner: ShareUserSnapshot;
  /**
   * Discriminates per-resource shares (`'share'`) from household memberships
   * (`'household'`). The frontend uses this to route management actions —
   * household rows go to Settings → Household, per-resource rows go to the
   * resource's share dialog. `'owner'` never appears here because this list
   * filters to recipient rows only.
   */
  accessSource: SharedWithMeAccessSource;
}

/**
 * Lists every accepted share where the caller is the recipient. Each row carries enough
 * denormalized context (resource name + owner snapshot) for the frontend to render the
 * shared-with-me page without N+1 lookups. The caller groups by `resourceType` for display
 * — the API itself returns a flat, accepted-at-DESC list to keep the contract resource-agnostic.
 */
export const listSharedWithMe = async ({ userId }: { userId: number }): Promise<SharedWithMeItem[]> => {
  const shares = await ResourceShares.findAll({
    where: {
      sharedWithUserId: userId,
      acceptedAt: { [Op.not]: null },
    },
    order: [['acceptedAt', 'DESC']],
  });
  if (!shares.length) return [];

  const ownerIds = Array.from(new Set(shares.map((s) => s.ownerUserId)));
  const owners = await Users.findAll({ where: { id: { [Op.in]: ownerIds } } });
  const ownersById = new Map(owners.map((o) => [o.id, o]));

  // Resolve resource names in a small per-call cache — the same resource could appear
  // multiple times if the caller had separate accepted shares for it from different
  // owners, though Phase 1 schema only allows one owner per resource so the cache is
  // mostly defensive against future expansion.
  const nameCache = new Map<string, string | null>();
  const items: SharedWithMeItem[] = [];

  for (const share of shares) {
    const cacheKey = `${share.resourceType}:${share.resourceId}`;
    if (!nameCache.has(cacheKey)) {
      nameCache.set(
        cacheKey,
        await resolveResourceName({ resourceType: share.resourceType, resourceId: share.resourceId }),
      );
    }
    items.push({
      shareId: share.id,
      resourceType: share.resourceType,
      resourceId: share.resourceId,
      resourceName: nameCache.get(cacheKey) ?? null,
      permission: share.permission,
      policy: share.policy,
      // The DB column is non-null in this query (filtered by `acceptedAt: not null`); the
      // model type still allows null so we narrow with `!`.
      acceptedAt: share.acceptedAt!,
      owner: snapshotShareUser(ownersById.get(share.ownerUserId), share.ownerUserId),
      accessSource: share.resourceType === RESOURCE_TYPES.household ? ACCESS_SOURCES.household : ACCESS_SOURCES.share,
    });
  }

  return items;
};
