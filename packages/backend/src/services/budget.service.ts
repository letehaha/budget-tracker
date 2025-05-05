import Budgets from '@models/Budget.model';
import { withTransaction } from './common';
import { BudgetModel } from '@bt/shared/types';

export const getBudgets = withTransaction(async (payload: { userId: number }): Promise<BudgetModel[]> => {
  const result = await getBudgetsModel(payload);
  return result;
});

export const getBudgetById = withTransaction(
  async (payload: { id: number; userId: number }): Promise<BudgetModel | null> => getBudgetByIdModel(payload),
);

export const getBudgetsModel = async ({ userId }: { userId: number }) => {
  const budgets = await Budgets.findAll({
    where: { userId },
  });

  return budgets
};

export const getBudgetByIdModel = async ({
  userId,
  id,
}: {
  userId: BudgetModel['userId'];
  id: BudgetModel['id'];
}) => {
  const account = await Budgets.findOne({
    where: { userId, id },
  });

  return account;
};
