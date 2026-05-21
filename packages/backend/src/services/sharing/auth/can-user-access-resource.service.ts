import {
  ACCESS_SOURCES,
  AccessSource,
  RESOURCE_TYPES,
  ResourceType,
  SHARE_PERMISSIONS,
  SharePermission,
  SharePolicy,
} from '@bt/shared/types';
import { UnexpectedError } from '@js/errors';
import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import Budgets from '@models/budget.model';
import ResourceShares from '@models/resource-shares.model';
import Users from '@models/users.model';
import { Op } from 'sequelize';

import { formatHouseholdLabel, toPositiveInt } from '../sharing-utils';
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
 *
 * `accessSource` distinguishes how the grant was derived: `owner` (caller is the resource
 * owner), `share` (per-resource ResourceShares row), or `household` (household-membership
 * grant — caller has an accepted household ResourceShares row against the resource's
 * owner). The frontend uses it to route management UX (per-resource invites vs the
 * household settings page).
 */
export type GrantedAccessResult = {
  granted: true;
  isOwner: boolean;
  effectivePermission: SharePermission;
  /** Recipient policy. Always `null` for owners. */
  policy: SharePolicy | null;
  ownerUserId: number;
  accessSource: AccessSource;
};

type DeniedAccessResult = {
  granted: false;
  isOwner: false;
  effectivePermission: null;
  policy: null;
  ownerUserId: number | null;
  accessSource: null;
};

type ResourceAccessResult = GrantedAccessResult | DeniedAccessResult;

/**
 * Looks up the owner of a polymorphic resource by `resourceType`. Returns `null` when the
 * resource doesn't exist (or the resource type isn't shareable yet). New resource types
 * extend this map without touching the calling code.
 */
type ResourceOwnerResolver = (resourceId: string) => Promise<number | null>;

const RESOURCE_OWNER_RESOLVERS: Record<ResourceType, ResourceOwnerResolver> = {
  [RESOURCE_TYPES.account]: async (resourceId) => {
    const account = (await Accounts.findOne({
      where: { id: resourceId },
      attributes: ['userId'],
      raw: true,
    })) as { userId: number } | null;
    return account?.userId ?? null;
  },
  // Household rows store `resourceId = ownerUserId::text` by convention (a DB
  // CHECK constraint enforces the invariant), so resolution is a parse — no DB
  // lookup needed. The actual household-membership precedence chain lives in
  // `canUserAccessResource` itself; this resolver only feeds the shape-checking
  // branch.
  [RESOURCE_TYPES.household]: async (resourceId) => toPositiveInt(resourceId),
  [RESOURCE_TYPES.budget]: async (resourceId) => {
    const budget = (await Budgets.findOne({
      where: { id: resourceId },
      attributes: ['userId'],
      raw: true,
    })) as { userId: number } | null;
    return budget?.userId ?? null;
  },
};

type ResourceNameResolver = (resourceId: string) => Promise<string | null>;

const RESOURCE_NAME_RESOLVERS: Record<ResourceType, ResourceNameResolver> = {
  [RESOURCE_TYPES.account]: async (resourceId) => {
    const account = (await Accounts.findOne({
      where: { id: resourceId },
      attributes: ['name'],
      raw: true,
    })) as { name: string } | null;
    return account?.name ?? null;
  },
  // Household rows don't reference a single named resource — they grant access to
  // every account the owner has. Use the owner's display name as the row label so
  // generic surfaces (notifications, list-shared-with-me, member-list) have something
  // to render without a separate join.
  [RESOURCE_TYPES.household]: async (resourceId) => {
    const numericOwnerId = toPositiveInt(resourceId);
    if (numericOwnerId === null) return null;
    const owner = (await Users.findOne({
      where: { id: numericOwnerId },
      attributes: ['username'],
      raw: true,
    })) as { username: string } | null;
    return owner ? formatHouseholdLabel(owner.username) : null;
  },
  [RESOURCE_TYPES.budget]: async (resourceId) => {
    const budget = (await Budgets.findOne({
      where: { id: resourceId },
      attributes: ['name'],
      raw: true,
    })) as { name: string } | null;
    return budget?.name ?? null;
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
  accessSource: null,
});

/**
 * Central authorization check used by every endpoint touching a shareable resource.
 *
 * Resolution order:
 *   1. user owns the resource → granted at effective permission `manage` (accessSource=`owner`)
 *   2. user has an accepted per-resource `ResourceShares` row → use that grant
 *      (accessSource=`share`). A per-resource share is always considered before any
 *      household-level grant — an explicit per-resource share is treated as the owner's
 *      deliberate scoping for *this* resource, so it short-circuits even when the level
 *      is below `requiredPermission` (we don't escalate via household once the owner has
 *      named a per-resource share).
 *   3. user has an accepted household `ResourceShares` row against the resource's owner
 *      → granted at that household permission (accessSource=`household`)
 *   4. otherwise denied
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
    // A `ResourceType` reached here without a registered owner resolver. TypeScript
    // exhaustiveness already requires the map to cover every union member, so this
    // can only happen when a caller bypasses the type system (a `string` cast) or
    // when a new resource type was added to the union but not to the map.
    //
    // Throwing in all environments — silent-deny in prod would mask a real bug, and
    // since `resourceType` reaches this function only after Zod-validation against the
    // enum, a missing resolver always means a code error (never user input). A clear
    // 500 is more actionable for users (and ops) than the owner seeing a confusing 404
    // on every request for their own resource.
    const message = `Unsupported resourceType=${resourceType} — register a RESOURCE_OWNER_RESOLVERS entry`;
    logger.error(
      { message, error: new Error(message) },
      {
        code: 'SHARE_ACCESS_RESOLVER_MISSING',
        resourceType,
        resourceId: String(resourceId),
        userId,
      },
    );
    throw new UnexpectedError({ message });
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
      accessSource: ACCESS_SOURCES.owner,
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

  if (share) {
    if (!isPermissionAtLeast({ granted: share.permission, required: requiredPermission })) {
      // Per-resource share exists but doesn't meet the required level. Collapse to denied
      // — see step (2) in the resolution-order comment for why we don't fall through to
      // household here.
      return denied(ownerUserId);
    }
    return {
      granted: true,
      isOwner: false,
      effectivePermission: share.permission,
      policy: share.policy,
      ownerUserId,
      accessSource: ACCESS_SOURCES.share,
    };
  }

  // Budgets are explicit-share only — they do NOT inherit access from a household
  // membership. (Decision: per-resource selective sharing for households is the
  // future direction; "all-or-nothing" auto-grant is the wrong primitive for budgets,
  // so we don't wire the fallthrough at all.) Stop here when no per-resource share
  // exists for a budget request.
  if (resourceType === RESOURCE_TYPES.budget) {
    return denied(ownerUserId);
  }

  // No per-resource share — check household membership. The household resourceId
  // convention (enforced by a DB CHECK constraint) is `ownerUserId::text`, so the
  // lookup keys off the just-resolved owner.
  const householdShare = (await ResourceShares.findOne({
    where: {
      sharedWithUserId: userId,
      resourceType: RESOURCE_TYPES.household,
      resourceId: String(ownerUserId),
      acceptedAt: { [Op.not]: null },
    },
    raw: true,
  })) as { permission: SharePermission; policy: SharePolicy | null } | null;

  if (!householdShare) {
    return denied(ownerUserId);
  }

  if (!isPermissionAtLeast({ granted: householdShare.permission, required: requiredPermission })) {
    return denied(ownerUserId);
  }

  return {
    granted: true,
    isOwner: false,
    effectivePermission: householdShare.permission,
    policy: householdShare.policy,
    ownerUserId,
    accessSource: ACCESS_SOURCES.household,
  };
};
