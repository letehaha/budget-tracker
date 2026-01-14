import { BudgetModel } from '@bt/shared/types';
import Budgets from '@models/Budget.model';
import Categories from '@models/Categories.model';

import { withTransaction } from './common/with-transaction';

export const getBudgets = withTransaction(async ({ userId }: { userId: number }) => {
  const budgets = await Budgets.findAll({
    where: { userId },
    include: [
      {
        model: Categories,
        as: 'categories',
        attributes: ['id', 'name', 'color', 'parentId'],
      },
    ],
  });

  return budgets;
});

export const getBudgetById = withTransaction(
  async ({ userId, id }: { userId: BudgetModel['userId']; id: BudgetModel['id'] }) => {
    const budget = await Budgets.findOne({
      where: { userId, id },
      include: [
        {
          model: Categories,
          as: 'categories',
          attributes: ['id', 'name', 'color', 'parentId'],
        },
      ],
    });

    return budget;
  },
);
