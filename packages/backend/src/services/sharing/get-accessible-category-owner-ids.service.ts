import Accounts from '@models/accounts.model';

import { getAccessibleAccountIdsForUser } from './get-accessible-account-ids.service';

/**
 * Returns the distinct user ids whose categories the caller can legitimately see in their
 * UI: themselves + every owner of an account they have read access to. Recipients on a
 * shared account must reference the owner's category set (per
 * `family-sharing-categories.md`), so any read path that joins transactions to categories
 * by `userId` would otherwise miss those rows and render them as "Unknown" / black in the
 * dashboard. Use this from stats / aggregation services that build a category lookup map
 * and need it to cover shared-account transactions too.
 */
export const getAccessibleCategoryOwnerIds = async ({ userId }: { userId: number }): Promise<number[]> => {
  const accessibleAccountIds = await getAccessibleAccountIdsForUser({ userId });
  if (accessibleAccountIds.length === 0) return [userId];

  // `raw: true` is forbidden on the Accounts model because it has Money columns; the
  // model instances respect the Money getters even though we only read `userId` here.
  const accountRows = await Accounts.findAll({
    where: { id: accessibleAccountIds },
    attributes: ['userId'],
  });

  const ownerUserIds = new Set<number>([userId, ...accountRows.map((r) => r.userId)]);
  return Array.from(ownerUserIds);
};
