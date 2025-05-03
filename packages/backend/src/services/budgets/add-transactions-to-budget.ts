import { withTransaction } from '@services/common/index';
import Budgets from '@models/Budget.model';
import Transactions from '@models/Transactions.model';
import BudgetTransactions from '@models/BudgetTransactions.model';

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
    throw new Error('Budget not found or you do not have access');
  }

  const transactions = await Transactions.findAll({
    where: {
      id: transactionIds,
      userId,
    },
  });

  if (transactions.length !== transactionIds.length) {
    throw new Error('Some transaction IDs are invalid or do not belong to you');
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
