import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import Budgets from '@models/Budget.model';
import BudgetTransactions from '@models/BudgetTransactions.model';
import { withTransaction } from '@services/common/with-transaction';
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
