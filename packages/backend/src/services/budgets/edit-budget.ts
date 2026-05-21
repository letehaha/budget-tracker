import { BUDGET_TYPES, SHARE_PERMISSIONS } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import BudgetCategories from '@models/budget-categories.model';
import Budgets from '@models/budget.model';
import Categories from '@models/categories.model';
import { withTransaction } from '@services/common/with-transaction';

import { authorizeBudgetAccess } from './authorize-budget-access';
import { expandCategoryIds } from './utils/expand-category-ids';

interface EditBudgetPayload {
  id: string;
  userId: number;
  name?: string;
  startDate?: string;
  endDate?: string;
  limitAmount?: Money;
  autoInclude?: boolean;
  categoryIds?: string[];
}

export const editBudget = withTransaction(async ({ id, userId, categoryIds, ...params }: EditBudgetPayload) => {
  // Manage-level required: metadata edits (name/dates/limit/autoInclude/categories) are
  // owner / manage-only per PRD reduced-write-scope decision. `write` recipients can
  // attach their own transactions but not mutate the budget definition itself, which
  // avoids "my partner renamed my budget" / "categories list moved under me" surprises.
  const { ownerUserId } = await authorizeBudgetAccess({
    userId,
    budgetId: id,
    requiredPermission: SHARE_PERMISSIONS.manage,
  });

  const budget = await findOrThrowNotFound({
    query: Budgets.findOne({ where: { id, userId: ownerUserId } }),
    message: t({ key: 'budgets.budgetNotFound' }),
  });

  await budget.update(params);

  // Update categories if provided and budget is category-based
  if (categoryIds !== undefined && budget.type === BUDGET_TYPES.category) {
    // Remove existing category links
    await BudgetCategories.destroy({ where: { budgetId: id } });

    // Add new category links (with expansion). Categories are resolved against the
    // OWNER's category tree, not the caller's — a `manage` recipient cannot inject
    // categories from their own tree (the budget belongs to the owner's namespace).
    if (categoryIds.length > 0) {
      const expandedCategoryIds = await expandCategoryIds({ userId: ownerUserId, categoryIds });

      if (expandedCategoryIds.length) {
        await BudgetCategories.bulkCreate(
          expandedCategoryIds.map((categoryId) => ({
            budgetId: id,
            categoryId,
          })),
        );
      }
    }
  }

  const updatedBudget = await Budgets.findOne({
    where: { id, userId: ownerUserId },
    attributes: { exclude: ['userId'] },
    include:
      budget.type === BUDGET_TYPES.category
        ? [{ model: Categories, as: 'categories', attributes: ['id', 'name', 'color', 'parentId'] }]
        : [],
  });

  return updatedBudget;
});
