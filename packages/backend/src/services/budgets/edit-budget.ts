import { BUDGET_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import Budgets from '@models/Budget.model';
import BudgetCategories from '@models/BudgetCategories.model';
import Categories from '@models/Categories.model';
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

  await budget.update(params);

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
