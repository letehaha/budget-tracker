import { BUDGET_TYPES } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import BudgetTransactions from '@models/budget-transactions.model';
import Budgets from '@models/budget.model';
import Transactions from '@models/transactions.model';
import { Op } from '@sequelize/core';
import { withTransaction } from '@services/common/with-transaction';

interface AddTransactionsPayload {
  budgetId: number;
  userId: number;
  transactionIds: number[];
}

export const addTransactionsToBudget = withTransaction(async (payload: AddTransactionsPayload) => {
  const { budgetId, userId, transactionIds } = payload;

  const budget = await findOrThrowNotFound({
    query: Budgets.findOne({ where: { id: budgetId, userId } }),
    message: t({ key: 'budgets.budgetNotFound' }),
  });

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
