import { RESOURCE_TYPES, ResourceType, SHARE_PERMISSIONS, SharePermission, SharePolicy } from '@bt/shared/types';
import Accounts from '@models/accounts.model';
import ResourceShares from '@models/resource-shares.model';
import { Op } from 'sequelize';

import { isPermissionAtLeast } from './permission-rank';

interface CanUserAccessResourceParams {
  userId: number;
  resourceType: ResourceType;
  /** Either an integer id or string id; coerced to string for the lookup. */
  resourceId: string | number;
  requiredPermission: SharePermission;
}

/**
 * Discriminated union: `granted: true` guarantees `ownerUserId` is a real number and
 * `effectivePermission` is non-null, so callers don't need defensive `?? caller` fallbacks.
 * `granted: false` carries the looked-up `ownerUserId` (or `null` when the resource
 * doesn't exist) for callers that want to differentiate "no claim at all" from "exists
 * but not enough permission".
 */
export type GrantedAccessResult = {
  granted: true;
  isOwner: boolean;
  effectivePermission: SharePermission;
  /** Recipient policy. Always `null` for owners. */
  policy: SharePolicy | null;
  ownerUserId: number;
};

type DeniedAccessResult = {
  granted: false;
  isOwner: false;
  effectivePermission: null;
  policy: null;
  ownerUserId: number | null;
};

type ResourceAccessResult = GrantedAccessResult | DeniedAccessResult;

/**
 * Looks up the owner of a polymorphic resource by `resourceType`. Returns `null` when the
 * resource doesn't exist (or the resource type isn't shareable yet).
 *
 * Phase 1 supports `account` only; new resource types extend this map without touching
 * the calling code.
 */
type ResourceOwnerResolver = (resourceId: string) => Promise<number | null>;

const RESOURCE_OWNER_RESOLVERS: Record<ResourceType, ResourceOwnerResolver> = {
  [RESOURCE_TYPES.account]: async (resourceId) => {
    const numericId = Number(resourceId);
    if (!Number.isInteger(numericId) || numericId <= 0) return null;
    const account = (await Accounts.findOne({
      where: { id: numericId },
      attributes: ['userId'],
      raw: true,
    })) as { userId: number } | null;
    return account?.userId ?? null;
  },
};

type ResourceNameResolver = (resourceId: string) => Promise<string | null>;

const RESOURCE_NAME_RESOLVERS: Record<ResourceType, ResourceNameResolver> = {
  [RESOURCE_TYPES.account]: async (resourceId) => {
    const numericId = Number(resourceId);
    if (!Number.isInteger(numericId) || numericId <= 0) return null;
    const account = (await Accounts.findOne({
      where: { id: numericId },
      attributes: ['name'],
      raw: true,
    })) as { name: string } | null;
    return account?.name ?? null;
  },
};

/**
 * Resolves the display name for a polymorphic resource. Returns `null` when the resource
 * doesn't exist or the type isn't supported. New resource types extend `RESOURCE_NAME_RESOLVERS`
 * without touching callers.
 */
export const resolveResourceName = async ({
  resourceType,
  resourceId,
}: {
  resourceType: ResourceType;
  resourceId: string;
}): Promise<string | null> => {
  const resolver = RESOURCE_NAME_RESOLVERS[resourceType];
  if (!resolver) return null;
  return resolver(resourceId);
};

const denied = (ownerUserId: number | null): DeniedAccessResult => ({
  granted: false,
  isOwner: false,
  effectivePermission: null,
  policy: null,
  ownerUserId,
});

/**
 * Central authorization check used by every endpoint touching a shareable resource.
 *
 * Resolution order (per F3):
 *   1. user owns the resource → granted at effective permission `manage`
 *   2. user has an accepted `ResourceShares` row for the resource → granted at that permission
 *      level (subject to the requested level being satisfied)
 *   3. otherwise denied
 *
 * Callers translate `granted: false` into a 403 (user has another role on the resource but
 * not enough) or 404 (user has no claim at all) at the controller layer.
 */
export const canUserAccessResource = async ({
  userId,
  resourceType,
  resourceId,
  requiredPermission,
}: CanUserAccessResourceParams): Promise<ResourceAccessResult> => {
  const resolver = RESOURCE_OWNER_RESOLVERS[resourceType];
  if (!resolver) {
    return denied(null);
  }

  const resourceIdStr = String(resourceId);
  const ownerUserId = await resolver(resourceIdStr);

  if (ownerUserId === null) {
    return denied(null);
  }

  if (ownerUserId === userId) {
    return {
      granted: true,
      isOwner: true,
      effectivePermission: SHARE_PERMISSIONS.manage,
      policy: null,
      ownerUserId,
    };
  }

  const share = (await ResourceShares.findOne({
    where: {
      sharedWithUserId: userId,
      resourceType,
      resourceId: resourceIdStr,
      acceptedAt: { [Op.not]: null },
    },
    raw: true,
  })) as { permission: SharePermission; policy: SharePolicy | null } | null;

  if (!share) {
    return denied(ownerUserId);
  }

  if (!isPermissionAtLeast({ granted: share.permission, required: requiredPermission })) {
    // Share exists but doesn't meet the required level — collapse to denied. Callers
    // that need the diagnostic detail (which permission they *do* hold) re-query with
    // a lower `requiredPermission`. None of the current callers do.
    return denied(ownerUserId);
  }

  return {
    granted: true,
    isOwner: false,
    effectivePermission: share.permission,
    policy: share.policy,
    ownerUserId,
  };
};
