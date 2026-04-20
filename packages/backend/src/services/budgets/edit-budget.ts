import { BUDGET_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import BudgetCategories from '@models/budget-categories.model';
import Budgets from '@models/budget.model';
import Categories from '@models/categories.model';
import { withTransaction } from '@services/common/with-transaction';

import { expandCategoryIds } from './utils/expand-category-ids';

interface EditBudgetPayload {
  id: number;
  userId: number;
  name?: string;
  startDate?: string;
  endDate?: string;
  limitAmount?: Money;
  autoInclude?: boolean;
  categoryIds?: number[];
}

export const editBudget = withTransaction(async ({ id, userId, categoryIds, ...params }: EditBudgetPayload) => {
  const budget = await Budgets.findOne({
    where: { id, userId },
  });

  if (!budget) {
    throw new NotFoundError({ message: t({ key: 'budgets.budgetNotFound' }) });
  }

  const { startDate, endDate, limitAmount, ...rest } = params;
  const updates: Parameters<typeof budget.update>[0] = { ...rest };
  if (startDate !== undefined) updates.startDate = startDate ? new Date(startDate) : null;
  if (endDate !== undefined) updates.endDate = endDate ? new Date(endDate) : null;
  if (limitAmount !== undefined) updates.limitAmount = limitAmount;

  await budget.update(updates);

  // Update categories if provided and budget is category-based
  if (categoryIds !== undefined && budget.type === BUDGET_TYPES.category) {
    // Remove existing category links
    await BudgetCategories.destroy({ where: { budgetId: id } });

    // Add new category links (with expansion)
    if (categoryIds.length > 0) {
      const expandedCategoryIds = await expandCategoryIds({ userId, categoryIds });

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
    where: { id, userId },
    attributes: { exclude: ['userId'] },
    include:
      budget.type === BUDGET_TYPES.category
        ? [{ model: Categories, as: 'categories', attributes: ['id', 'name', 'color', 'parentId'] }]
        : [],
  });

  return updatedBudget;
});
