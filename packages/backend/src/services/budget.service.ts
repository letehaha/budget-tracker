import { BUDGET_STATUSES, BudgetModel } from '@bt/shared/types';
import Budgets from '@models/budget.model';
import Categories from '@models/categories.model';
import { Op } from '@sequelize/core';

import { withTransaction } from './common/with-transaction';

export const getBudgets = withTransaction(
  async ({ userId, statuses }: { userId: number; statuses?: BUDGET_STATUSES[] }) => {
    const where: Record<string, unknown> = { userId };

    if (statuses?.length) {
      where.status = { [Op.in]: statuses };
    }

    const budgets = await Budgets.findAll({
      where,
      include: [
        {
          model: Categories,
          as: 'categories',
          attributes: ['id', 'name', 'color', 'parentId'],
        },
      ],
    });

    return budgets;
  },
);

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

    return budget as BudgetByIdReturnType | null;
  },
);
