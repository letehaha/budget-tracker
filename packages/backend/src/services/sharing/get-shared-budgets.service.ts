import {
  ACCESS_SOURCES,
  AccessSource,
  RESOURCE_TYPES,
  SHARE_PERMISSIONS,
  SharePermission,
  SharePolicy,
} from '@bt/shared/types';
import Budgets from '@models/budget.model';
import ResourceShares from '@models/resource-shares.model';
import Users from '@models/users.model';
import { Op } from 'sequelize';

import { canUserAccessResource } from './auth/can-user-access-resource.service';
import { ShareUserSnapshot, snapshotShareUser } from './share-user-snapshot';

/**
 * Per-budget share context attached to model instances by the budgets service so the
 * serializer can emit the public-facing `share` block.
 *
 * Shape mirrors `AccountShareContext` deliberately — the recipient-facing payload is
 * resource-agnostic at the frontend (header chip + members panel), so keeping the
 * shape identical lets the same UI components consume both. Budgets never carry a
 * household `accessSource` (explicit-share only), but the field stays typed against
 * the full `AccessSource` union so a future selective-share extension doesn't need a
 * type widening.
 */
export interface BudgetShareContext {
  isOwner: boolean;
  owner: ShareUserSnapshot;
  permission: SharePermission;
  policy: SharePolicy | null;
  accessSource: AccessSource;
}

/**
 * Build the share context for a budget the requesting user owns. Permission is
 * implicit `manage` (owners always have full control).
 */
export const buildOwnerBudgetShareContext = async ({
  ownerUser,
}: {
  ownerUser: Users;
}): Promise<BudgetShareContext> => ({
  isOwner: true,
  owner: snapshotShareUser(ownerUser, ownerUser.id),
  permission: SHARE_PERMISSIONS.manage,
  policy: null,
  accessSource: ACCESS_SOURCES.owner,
});

const buildRecipientBudgetShareContext = ({
  ownerUser,
  ownerUserId,
  permission,
  policy,
}: {
  ownerUser: Users | null | undefined;
  ownerUserId: number;
  permission: SharePermission;
  policy: SharePolicy | null;
}): BudgetShareContext => ({
  isOwner: false,
  owner: snapshotShareUser(ownerUser, ownerUserId),
  permission,
  policy,
  // Budgets are explicit-share only — no household auto-grant — so the access source
  // is always `'share'` for recipients. If selective-share lands later (household
  // owner picks specific budgets), the resolver can return `'household'` here.
  accessSource: ACCESS_SOURCES.share,
});

/**
 * Returns budgets the user has been granted access to (accepted shares only) along
 * with the share context describing the recipient's permission level. Mirrors
 * `getSharedAccountsForUser` but drops the household-source union — budgets are
 * explicit-share only.
 *
 * Returns plain Sequelize model instances (not raw rows) — the Money getter on
 * `Budgets.limitAmount` needs to be alive for the serializer to convert the limit
 * correctly.
 */
export const getSharedBudgetsForUser = async ({
  userId,
}: {
  userId: number;
}): Promise<Array<Budgets & { _shareContext: BudgetShareContext }>> => {
  const shares = await ResourceShares.findAll({
    where: {
      sharedWithUserId: userId,
      resourceType: RESOURCE_TYPES.budget,
      acceptedAt: { [Op.not]: null },
    },
  });
  if (!shares.length) return [];

  const budgetIds: string[] = [];
  const sharesByResourceId = new Map<string, ResourceShares>();
  for (const share of shares) {
    if (share.resourceId) {
      budgetIds.push(share.resourceId);
      sharesByResourceId.set(share.resourceId, share);
    }
  }
  if (!budgetIds.length) return [];

  const budgets = await Budgets.findAll({ where: { id: { [Op.in]: budgetIds } } });
  if (!budgets.length) return [];

  const ownerIds = Array.from(new Set(budgets.map((b) => b.userId)));
  const owners = ownerIds.length ? await Users.findAll({ where: { id: { [Op.in]: ownerIds } } }) : [];
  const ownersById = new Map(owners.map((o) => [o.id, o]));

  return budgets.map((budget) => {
    const share = sharesByResourceId.get(String(budget.id));
    return Object.assign(budget, {
      _shareContext: buildRecipientBudgetShareContext({
        ownerUser: ownersById.get(budget.userId) ?? null,
        ownerUserId: budget.userId,
        permission: share?.permission ?? SHARE_PERMISSIONS.read,
        policy: share?.policy ?? null,
      }),
    });
  });
};

/**
 * Looks up a single shared budget by id for the calling user. Returns `null` if the
 * user has no accepted share for it. Owner branch is intentionally `null` here — the
 * budgets service handles owner lookups separately.
 */
export const getSharedBudgetById = async ({
  userId,
  id,
}: {
  userId: number;
  id: string;
}): Promise<(Budgets & { _shareContext: BudgetShareContext }) | null> => {
  const access = await canUserAccessResource({
    userId,
    resourceType: RESOURCE_TYPES.budget,
    resourceId: id,
    requiredPermission: SHARE_PERMISSIONS.read,
  });

  if (!access.granted || access.isOwner) return null;

  const budget = await Budgets.findOne({ where: { id } });
  if (!budget) return null;

  const ownerUser = await Users.findByPk(budget.userId);

  return Object.assign(budget, {
    _shareContext: buildRecipientBudgetShareContext({
      ownerUser,
      ownerUserId: budget.userId,
      permission: access.effectivePermission,
      policy: access.policy,
    }),
  });
};
