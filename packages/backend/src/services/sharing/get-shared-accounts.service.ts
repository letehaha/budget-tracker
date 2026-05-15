import {
  ACCESS_SOURCES,
  ACCOUNT_TYPES,
  AccessSource,
  RESOURCE_TYPES,
  SHARE_PERMISSIONS,
  SharePermission,
  SharePolicy,
} from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import ResourceShares from '@models/resource-shares.model';
import Users from '@models/users.model';
import { Op } from 'sequelize';

import { canUserAccessResource } from './auth/can-user-access-resource.service';
import { ShareUserSnapshot, snapshotShareUser } from './share-user-snapshot';
import { toPositiveInt } from './sharing-utils';

/**
 * Per-account share context attached to model instances by the accounts service so the
 * serializer can emit the public-facing `share` block (per PRD F14).
 */
export interface AccountShareContext {
  isOwner: boolean;
  owner: ShareUserSnapshot;
  permission: SharePermission;
  policy: SharePolicy | null;
  accessSource: AccessSource;
}

/**
 * Build the share context for an account the requesting user owns. Permission is
 * implicit `manage` (owners always have full control).
 */
export const buildOwnerShareContext = async ({ ownerUser }: { ownerUser: Users }): Promise<AccountShareContext> => ({
  isOwner: true,
  owner: snapshotShareUser(ownerUser, ownerUser.id),
  permission: SHARE_PERMISSIONS.manage,
  policy: null,
  accessSource: ACCESS_SOURCES.owner,
});

/**
 * Builds a share context for a recipient — denormalizes the resource owner so the
 * frontend can display "shared by X" without a follow-up request.
 *
 * `accessSource` defaults to `'share'` (per-resource grant). Callers that
 * resolve a household grant pass `'household'` explicitly so the frontend can
 * route to Settings → Household for management instead of the per-resource UI.
 */
const buildRecipientShareContext = ({
  ownerUser,
  ownerUserId,
  permission,
  policy,
  accessSource = ACCESS_SOURCES.share,
}: {
  ownerUser: Users | null | undefined;
  ownerUserId: number;
  permission: SharePermission;
  policy: SharePolicy | null;
  accessSource?: AccessSource;
}): AccountShareContext => ({
  isOwner: false,
  owner: snapshotShareUser(ownerUser, ownerUserId),
  permission,
  policy,
  accessSource,
});

/**
 * Returns accounts the user has been granted access to (accepted shares only) along with
 * the share context describing the recipient's permission level and policy. Filters by
 * account type when provided, mirroring the owned-account `getAccounts` semantics.
 *
 * Visibility unions two sources:
 *   - Per-resource account shares (`resourceType='account'`).
 *   - Accounts owned by users who granted the caller a household membership
 *     (`resourceType='household'`, `resourceId=grantorUserId`).
 *
 * When the same account appears via both sources, the per-resource share wins precedence
 * (matches the auth resolution in `canUserAccessResource`). Per-resource rows surface with
 * `accessSource='share'`; household-derived rows surface with `accessSource='household'`
 * so the frontend can route management to Settings → Household rather than the per-account
 * share dialog.
 *
 * Returns plain Sequelize model instances (not raw rows) — the Money getters on
 * `Accounts` need to be alive for the serializer to convert balances correctly.
 */
export const getSharedAccountsForUser = async ({
  userId,
  type,
}: {
  userId: number;
  type?: ACCOUNT_TYPES;
}): Promise<Array<Accounts & { _shareContext: AccountShareContext }>> => {
  const [perResourceShares, householdShares] = await Promise.all([
    ResourceShares.findAll({
      where: {
        sharedWithUserId: userId,
        resourceType: RESOURCE_TYPES.account,
        acceptedAt: { [Op.not]: null },
      },
    }),
    ResourceShares.findAll({
      where: {
        sharedWithUserId: userId,
        resourceType: RESOURCE_TYPES.household,
        acceptedAt: { [Op.not]: null },
      },
    }),
  ]);
  if (!perResourceShares.length && !householdShares.length) return [];

  const perResourceAccountIds: number[] = [];
  const sharesByResourceId = new Map<string, ResourceShares>();
  for (const share of perResourceShares) {
    const numeric = toPositiveInt(share.resourceId);
    if (numeric !== null) {
      perResourceAccountIds.push(numeric);
      sharesByResourceId.set(share.resourceId, share);
    } else {
      // Account-type shares always carry a positive integer string `resourceId` (it's an
      // FK into Accounts). A non-numeric value here means the row was written through a
      // path that bypassed the create-share guards — data corruption, not a recoverable
      // edge case. Drop the row from the response so the user isn't blocked, but log so
      // ops can investigate.
      logger.error(
        {
          message: 'Account-type share row has non-numeric resourceId',
          error: new Error(`resourceId=${JSON.stringify(share.resourceId)}`),
        },
        {
          code: 'SHARED_ACCOUNT_INVALID_RESOURCE_ID',
          shareId: share.id,
          userId,
          resourceId: share.resourceId,
        },
      );
    }
  }

  const grantorUserIds: number[] = [];
  const householdByGrantorId = new Map<number, ResourceShares>();
  for (const share of householdShares) {
    const numeric = toPositiveInt(share.resourceId);
    if (numeric !== null) {
      grantorUserIds.push(numeric);
      householdByGrantorId.set(numeric, share);
    } else {
      // Household resourceId is the grantor user id (CHECK constraint enforces shape).
      // A non-numeric value implies a bypass at write time — log + drop.
      logger.error(
        {
          message: 'Household share row has non-numeric resourceId',
          error: new Error(`resourceId=${JSON.stringify(share.resourceId)}`),
        },
        {
          code: 'SHARED_HOUSEHOLD_INVALID_RESOURCE_ID',
          shareId: share.id,
          userId,
          resourceId: share.resourceId,
        },
      );
    }
  }

  // Bulk-load all candidate accounts in one query, filtered by type if requested. Both
  // sources contribute — per-resource accounts by id, household-derived by grantor userId.
  const orClauses: Array<Record<string, unknown>> = [];
  if (perResourceAccountIds.length) orClauses.push({ id: { [Op.in]: perResourceAccountIds } });
  if (grantorUserIds.length) orClauses.push({ userId: { [Op.in]: grantorUserIds } });
  if (!orClauses.length) return [];

  const accountWhere: Record<string, unknown> = orClauses.length === 1 ? orClauses[0]! : { [Op.or]: orClauses };
  if (type) accountWhere.type = type;

  const accounts = await Accounts.findAll({ where: accountWhere });
  if (!accounts.length) return [];

  const ownerIds = Array.from(new Set(accounts.map((a) => a.userId)));
  const owners = ownerIds.length ? await Users.findAll({ where: { id: { [Op.in]: ownerIds } } }) : [];
  const ownersById = new Map(owners.map((o) => [o.id, o]));

  return accounts.map((account) => {
    const perResourceShare = sharesByResourceId.get(String(account.id));
    if (perResourceShare) {
      return Object.assign(account, {
        _shareContext: buildRecipientShareContext({
          ownerUser: ownersById.get(account.userId) ?? null,
          ownerUserId: account.userId,
          permission: perResourceShare.permission,
          policy: perResourceShare.policy,
          accessSource: ACCESS_SOURCES.share,
        }),
      });
    }
    // Account survived the WHERE filter only because its userId matched a household
    // grantor. The membership row drives permission/policy for this account.
    const householdShare = householdByGrantorId.get(account.userId);
    if (!householdShare) {
      // Defensive: control flow guarantees this exists, but if a future change to the
      // OR-clause logic ever lets an unrelated account through, return the account
      // without share context rather than crashing with a non-null assertion.
      logger.error(
        {
          message: 'Account in shared-accounts response has no matching share context',
          error: new Error(`accountId=${account.id} userId=${account.userId}`),
        },
        { code: 'SHARED_ACCOUNT_NO_SHARE_CONTEXT', userId, accountId: account.id },
      );
      return Object.assign(account, {
        _shareContext: buildRecipientShareContext({
          ownerUser: ownersById.get(account.userId) ?? null,
          ownerUserId: account.userId,
          permission: SHARE_PERMISSIONS.read,
          policy: null,
          accessSource: ACCESS_SOURCES.household,
        }),
      });
    }
    return Object.assign(account, {
      _shareContext: buildRecipientShareContext({
        ownerUser: ownersById.get(account.userId) ?? null,
        ownerUserId: account.userId,
        permission: householdShare.permission,
        policy: householdShare.policy,
        accessSource: ACCESS_SOURCES.household,
      }),
    });
  });
};

/**
 * Looks up a single shared account by id for the calling user. Returns `null` if the
 * user has no accepted share for it (the caller decides whether to fall through to a
 * 404 or another error path).
 *
 * Uses the central authorization service for the access check so the resolution order
 * (owner → accepted share → deny) is consistent with every other read path.
 */
export const getSharedAccountById = async ({
  userId,
  id,
}: {
  userId: number;
  id: number;
}): Promise<(Accounts & { _shareContext: AccountShareContext }) | null> => {
  const access = await canUserAccessResource({
    userId,
    resourceType: RESOURCE_TYPES.account,
    resourceId: id,
    requiredPermission: SHARE_PERMISSIONS.read,
  });

  // The owner branch is handled separately by the accounts service (it doesn't need a
  // shared-account lookup), so fall through `null` here and let the caller decide.
  if (!access.granted || access.isOwner) return null;

  const account = await Accounts.findOne({ where: { id } });
  if (!account) return null;

  const ownerUser = await Users.findByPk(account.userId);

  return Object.assign(account, {
    _shareContext: buildRecipientShareContext({
      ownerUser,
      ownerUserId: account.userId,
      permission: access.effectivePermission,
      policy: access.policy,
      accessSource: access.accessSource,
    }),
  });
};
