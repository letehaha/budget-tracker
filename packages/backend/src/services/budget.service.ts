import { BudgetModel } from '@bt/shared/types';
import Budgets from '@models/Budget.model';

import { withTransaction } from './common';

export const getBudgets = withTransaction(async ({ userId }: { userId: number }) => {
  const budgets = await Budgets.findAll({
    where: { userId },
  });

  return budgets;
});

export const getBudgetById = withTransaction(
  async ({ userId, id }: { userId: BudgetModel['userId']; id: BudgetModel['id'] }) => {
    const account = await Budgets.findOne({
      where: { userId, id },
    });

    return account;
  },
);
