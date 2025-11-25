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
    throw new NotFoundError({ message: 'Budget not found' });
  }

  const transactions = await Transactions.findAll({
    where: {
      id: { [Op.in]: transactionIds },
      userId,
    },
  });

  if (transactions.length !== transactionIds.length) {
    throw new ValidationError({ message: 'Some transactions IDs are invalid' });
  }

  const budgetTransactions = transactionIds.map((transactionId) => ({
    budgetId,
    transactionId,
    isManual: true,
  }));

  await BudgetTransactions.bulkCreate(budgetTransactions);

  return {
    message: 'Transactions added successfully',
  };
});
