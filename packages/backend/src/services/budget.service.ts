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

type BudgetByIdReturnType = Budgets & { categories: Pick<Categories, 'id' | 'name' | 'color' | 'parentId'>[] };

export const getBudgetById = withTransaction(
  async ({
    userId,
    id,
  }: {
    userId: BudgetModel['userId'];
    id: BudgetModel['id'];
  }): Promise<BudgetByIdReturnType | null> => {
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
