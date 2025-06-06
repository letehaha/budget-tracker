import { NotFoundError } from '@js/errors';
import Budgets from '@models/Budget.model';
import BudgetTransactions from '@models/BudgetTransactions.model';
import { withTransaction } from '@services/common/index';
import { Op } from 'sequelize';

interface RemoveTransactionsPayload {
  budgetId: number;
  userId: number;
  transactionIds: number[];
}

export const removeTransactionsFromBudget = withTransaction(async (payload: RemoveTransactionsPayload) => {
  const { budgetId, userId, transactionIds } = payload;

  const budget = await Budgets.findOne({
    where: { id: budgetId, userId },
  });

  if (!budget) {
    throw new NotFoundError({ message: 'Budget not found' });
  }

  await BudgetTransactions.destroy({
    where: {
      budgetId,
      transactionId: {
        [Op.in]: transactionIds,
      },
    },
  });
});
