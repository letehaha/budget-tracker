import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import BudgetTransactions from '@models/budget-transactions.model';
import Budgets from '@models/budget.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op } from 'sequelize';

interface RemoveTransactionsPayload {
  budgetId: number;
  userId: number;
  transactionIds: number[];
}

export const removeTransactionsFromBudget = withTransaction(async (payload: RemoveTransactionsPayload) => {
  const { budgetId, userId, transactionIds } = payload;

  await findOrThrowNotFound({
    query: Budgets.findOne({ where: { id: budgetId, userId } }),
    message: t({ key: 'budgets.budgetNotFound' }),
  });

  await BudgetTransactions.destroy({
    where: {
      budgetId,
      transactionId: {
        [Op.in]: transactionIds,
      },
    },
  });
});
