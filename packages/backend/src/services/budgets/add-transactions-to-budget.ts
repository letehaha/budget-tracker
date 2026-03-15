import { BUDGET_TYPES } from '@bt/shared/types';
import { t } from '@i18n/index';
import { NotFoundError, ValidationError } from '@js/errors';
import Budgets from '@models/Budget.model';
import BudgetTransactions from '@models/BudgetTransactions.model';
import Transactions from '@models/Transactions.model';
import { withTransaction } from '@services/common/with-transaction';
import { Op } from 'sequelize';

interface AddTransactionsPayload {
  budgetId: number;
  userId: number;
  transactionIds: number[];
}

export const addTransactionsToBudget = withTransaction(async (payload: AddTransactionsPayload) => {
  const { budgetId, userId, transactionIds } = payload;

  const budget = await Budgets.findOne({
    where: { id: budgetId, userId },
  });
  if (!budget) {
    throw new NotFoundError({ message: t({ key: 'budgets.budgetNotFound' }) });
  }

  // Category budgets auto-track transactions by category - manual linking is not allowed
  if (budget.type === BUDGET_TYPES.category) {
    throw new ValidationError({ message: t({ key: 'budgets.cannotManuallyLinkToCategoryBudget' }) });
  }

  const transactions = await Transactions.findAll({
    where: {
      id: { [Op.in]: transactionIds },
      userId,
    },
  });

  if (transactions.length !== transactionIds.length) {
    throw new ValidationError({ message: t({ key: 'budgets.someTransactionIdsInvalid' }) });
  }

  const budgetTransactions = transactionIds.map((transactionId) => ({
    budgetId,
    transactionId,
    isManual: true,
  }));

  await BudgetTransactions.bulkCreate(budgetTransactions);

  return {
    message: t({ key: 'budgets.transactionsAddedSuccessfully' }),
  };
});
