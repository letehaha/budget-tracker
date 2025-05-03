import { withTransaction } from '@services/common/index';
import Budgets from '@models/Budget.model';
// import Transactions from '@models/Transactions.model';

export const editBudgetService = withTransaction(async (payload: EditBudgetPayload) => {
  await editBudgetModel(payload);
});

export interface EditBudgetPayload {
  id: number;
  userId: number;
  name?: string;
  startDate?: string;
  endDate?: string;
  limitAmount?: number;
  autoInclude?: boolean
}

export const editBudgetModel = async ({ id, userId, ...params }: EditBudgetPayload) => {

  const budget = await Budgets.findOne({
    where: { id, userId },
  });

  if (!budget) {
    throw new Error('Budget not found');
  }

  const [, budgets] = await Budgets.update(params, {
    where: {
      id: id,
      userId,
    },
    returning: true,
  });

  return budgets;
};
