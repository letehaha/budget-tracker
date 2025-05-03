import { withTransaction } from '@services/common/index';
import Budgets from '@models/Budget.model';
import BudgetTransactions from '@models/BudgetTransactions.model';

export interface DeleteBudgetPayload {
  id: number;
  userId?: number;
}

export const deleteBudget = withTransaction(async ({ id, userId }: { id: number; userId: number }) => {
  const result = await deleteBudgetModel({ id, userId });
  return result;
});

export const deleteBudgetModel = async ({ id, userId }: DeleteBudgetPayload) => {
  const budget = await Budgets.findOne({
    where: { id, userId },
  });

  if (!budget) {
    throw new Error('Budget not found');
  }

  await BudgetTransactions.destroy({
    where: { budgetId: id },
  });

  await budget.destroy();

  return { success: true };
};
