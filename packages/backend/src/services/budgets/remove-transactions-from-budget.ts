import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import BudgetTransactions from '@models/budget-transactions.model';
import Budgets from '@models/budget.model';
import { Op } from '@sequelize/core';
import { withTransaction } from '@services/common/with-transaction';

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
    throw new NotFoundError({ message: t({ key: 'budgets.budgetNotFound' }) });
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
