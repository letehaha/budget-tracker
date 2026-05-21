import { RESOURCE_TYPES } from '@bt/shared/types';
import Accounts from '@models/accounts.model';
import Budgets from '@models/budget.model';
import ResourceShares from '@models/resource-shares.model';
import { Op } from 'sequelize';

import { getAccessibleAccountIdsForUser } from './get-accessible-account-ids.service';
import { getAccessibleBudgetIdsForUser } from './get-accessible-budget-ids.service';

/**
 * Returns the distinct user ids whose categories the caller can legitimately see in their
 * UI: themselves + every owner of an account they have read access to + every owner of a
 * budget they have read access to + every recipient of a budget the caller owns.
 *
 * Recipients on a shared account must reference the owner's category set (per
 * `family-sharing-categories.md`); recipients on a shared budget likewise need owner's
 * categories so the spending-by-category breakdown can render names/colors/icons for the
 * owner-attached transactions (which carry the owner's `categoryId`, foreign to the
 * recipient's local tree).
 *
 * The reverse direction also matters: when a recipient attaches one of their own
 * transactions to a shared budget, that row carries the recipient's `categoryId`. The
 * budget owner viewing their own budget would otherwise see those rows as "Other" / no
 * icon. Including recipients-of-my-budgets covers that lookup. Shared-account writes do
 * not need the reverse expansion because recipients are forced onto the owner's
 * category tree at write time.
 *
 * Any read path that joins transactions to categories by `userId` would otherwise miss
 * the foreign-categoryId rows and render them as "Unknown" / black in the dashboard. Use
 * this from stats / aggregation services that build a category lookup map and need it to
 * cover shared transactions too.
 */
export const getAccessibleCategoryOwnerIds = async ({ userId }: { userId: number }): Promise<number[]> => {
  const [accessibleAccountIds, accessibleBudgetIds, ownedBudgetShareRecipientRows] = await Promise.all([
    getAccessibleAccountIdsForUser({ userId }),
    getAccessibleBudgetIdsForUser({ userId }),
    ResourceShares.findAll({
      where: {
        ownerUserId: userId,
        resourceType: RESOURCE_TYPES.budget,
        acceptedAt: { [Op.not]: null },
      },
      attributes: ['sharedWithUserId'],
      raw: true,
    }) as unknown as Promise<Array<{ sharedWithUserId: number }>>,
  ]);

  const ownerUserIds = new Set<number>([userId]);

  if (accessibleAccountIds.length) {
    // `raw: true` is forbidden on the Accounts model because it has Money columns; the
    // model instances respect the Money getters even though we only read `userId` here.
    const accountRows = await Accounts.findAll({
      where: { id: accessibleAccountIds },
      attributes: ['userId'],
    });
    for (const row of accountRows) ownerUserIds.add(row.userId);
  }

  if (accessibleBudgetIds.length) {
    const budgetRows = (await Budgets.findAll({
      where: { id: accessibleBudgetIds },
      attributes: ['userId'],
      raw: true,
    })) as unknown as Array<{ userId: number }>;
    for (const row of budgetRows) ownerUserIds.add(row.userId);
  }

  for (const row of ownedBudgetShareRecipientRows) ownerUserIds.add(row.sharedWithUserId);

  return Array.from(ownerUserIds);
};
