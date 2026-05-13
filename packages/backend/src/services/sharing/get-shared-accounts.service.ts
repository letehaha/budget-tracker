import { ACCOUNT_TYPES, RESOURCE_TYPES, SHARE_PERMISSIONS, SharePermission, SharePolicy } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import ResourceShares from '@models/resource-shares.model';
import Users from '@models/users.model';
import { Op } from 'sequelize';

import { canUserAccessResource } from './auth/can-user-access-resource.service';
import { ShareUserSnapshot, snapshotShareUser } from './share-user-snapshot';

/**
 * Per-account share context attached to model instances by the accounts service so the
 * serializer can emit the public-facing `share` block (per PRD F14).
 */
export interface AccountShareContext {
  isOwner: boolean;
  owner: ShareUserSnapshot;
  permission: SharePermission;
  policy: SharePolicy | null;
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
});

/**
 * Builds a share context for a recipient — denormalizes the resource owner so the
 * frontend can display "shared by X" without a follow-up request.
 */
const buildRecipientShareContext = ({
  ownerUser,
  ownerUserId,
  permission,
  policy,
}: {
  ownerUser: Users | null | undefined;
  ownerUserId: number;
  permission: SharePermission;
  policy: SharePolicy | null;
}): AccountShareContext => ({
  isOwner: false,
  owner: snapshotShareUser(ownerUser, ownerUserId),
  permission,
  policy,
});

/**
 * Returns accounts the user has been granted access to (accepted shares only) along with
 * the share context describing the recipient's permission level and policy. Filters by
 * account type when provided, mirroring the owned-account `getAccounts` semantics.
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
  const shares = await ResourceShares.findAll({
    where: {
      sharedWithUserId: userId,
      resourceType: RESOURCE_TYPES.account,
      acceptedAt: { [Op.not]: null },
    },
  });
  if (!shares.length) return [];

  const accountIds: number[] = [];
  const sharesByResourceId = new Map<string, ResourceShares>();
  for (const share of shares) {
    const numeric = Number(share.resourceId);
    if (Number.isInteger(numeric) && numeric > 0) {
      accountIds.push(numeric);
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
  if (!accountIds.length) return [];

  const accountWhere: Record<string, unknown> = { id: { [Op.in]: accountIds } };
  if (type) accountWhere.type = type;

  const accounts = await Accounts.findAll({ where: accountWhere });

  const ownerIds = Array.from(new Set(accounts.map((a) => a.userId)));
  const owners = ownerIds.length ? await Users.findAll({ where: { id: { [Op.in]: ownerIds } } }) : [];
  const ownersById = new Map(owners.map((o) => [o.id, o]));

  return accounts.map((account) => {
    const share = sharesByResourceId.get(String(account.id))!;
    return Object.assign(account, {
      _shareContext: buildRecipientShareContext({
        ownerUser: ownersById.get(account.userId) ?? null,
        ownerUserId: account.userId,
        permission: share.permission,
        policy: share.policy,
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
    }),
  });
};
