import { NotFoundError } from '@js/errors';
import Budgets from '@models/Budget.model';
import { withTransaction } from '@services/common/with-transaction';

export interface EditBudgetPayload {
  id: number;
  userId: number;
  name?: string;
  startDate?: string;
  endDate?: string;
  limitAmount?: number;
  autoInclude?: boolean;
}

export const editBudget = withTransaction(async ({ id, userId, ...params }: EditBudgetPayload) => {
  const budget = await Budgets.findOne({
    where: { id, userId },
  });

  if (!budget) {
    throw new NotFoundError({ message: 'Budget not found' });
  }

  await budget.update(params);

  const updatedBudget = await Budgets.findOne({
    where: { id, userId },
    attributes: {
      exclude: ['userId', 'categoryName'],
    },
    raw: true,
  });

  return updatedBudget;
});
