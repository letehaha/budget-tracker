import { RESOURCE_TYPES } from '@bt/shared/types';
import Budgets from '@models/budget.model';
import ResourceShares from '@models/resource-shares.model';
import { Op } from 'sequelize';

/**
 * Returns the union of budget ids the user has read access to:
 *   - their owned budgets
 *   - budgets shared with them via an accepted per-resource `ResourceShares` row
 *
 * Budgets are explicit-share only (household auto-grant is NOT wired for this
 * resource type — see {@link can-user-access-resource.service}). Mirrors
 * {@link get-accessible-account-ids.service} in shape so the public tx read-path
 * can use the same scoping pattern.
 *
 * Used by `getTransactions` to expand visibility when a caller filters by
 * `budgetIds`: anything in an accessible budget is visible regardless of which
 * underlying account the tx lives in, since budget-share confers per-budget
 * visibility independent of account-share.
 */
export const getAccessibleBudgetIdsForUser = async ({ userId }: { userId: number }): Promise<string[]> => {
  const [ownedRows, perResourceRows] = await Promise.all([
    Budgets.findAll({
      where: { userId },
      attributes: ['id'],
      raw: true,
    }) as unknown as Promise<{ id: string }[]>,
    ResourceShares.findAll({
      where: {
        sharedWithUserId: userId,
        resourceType: RESOURCE_TYPES.budget,
        acceptedAt: { [Op.not]: null },
      },
      attributes: ['resourceId'],
      raw: true,
    }) as unknown as Promise<{ resourceId: string }[]>,
  ]);

  const ids = new Set<string>();
  for (const row of ownedRows) ids.add(row.id);
  for (const row of perResourceRows) {
    if (row.resourceId) ids.add(row.resourceId);
  }

  return Array.from(ids).toSorted();
};
