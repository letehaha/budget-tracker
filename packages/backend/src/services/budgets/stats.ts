import { TRANSACTION_TYPES } from '@bt/shared/types';
import { NotFoundError } from '@js/errors';
import Budgets from '@models/Budget.model';
import * as Transactions from '@models/Transactions.model';

import { withTransaction } from '../common/with-transaction';

interface StatsResponse {
  summary: {
    actualIncome: number;
    actualExpense: number;
    balance: number; // Net difference
    utilizationRate: null | number; // Percentage used (0-100)
    transactionsCount: number;
    firstTransactionDate: string | null; // ISO date string of earliest transaction
    lastTransactionDate: string | null; // ISO date string of latest transaction
  };
}

export const getResponseInitialState = (): StatsResponse => ({
  summary: {
    actualIncome: 0,
    actualExpense: 0,
    balance: 0, // Net difference
    utilizationRate: null, // Percentage used (0-100)
    transactionsCount: 0,
    firstTransactionDate: null,
    lastTransactionDate: null,
  },
});

export const getBudgetStats = withTransaction(
  async ({ userId, budgetId }: { userId: number; budgetId: number }): Promise<StatsResponse> => {
    const budgetDetails = await Budgets.findByPk(budgetId);

    if (!budgetDetails) throw new NotFoundError({ message: 'Budget not found' });

    const transactions: Pick<Transactions.default, 'time' | 'amount' | 'refAmount' | 'transactionType'>[] =
      await Transactions.findWithFilters({
        userId,
        excludeTransfer: true,
        budgetIds: [budgetId],
        from: 0,
        limit: Infinity,
        isRaw: true,
        attributes: ['time', 'amount', 'refAmount', 'transactionType'],
      });

    const result = transactions.reduce((acc, curr) => {
      const isExpense = curr.transactionType === TRANSACTION_TYPES.expense;

      if (isExpense) {
        acc.summary.actualExpense += curr.refAmount;
        acc.summary.balance -= curr.refAmount;
      } else {
        acc.summary.actualIncome += curr.refAmount;
        acc.summary.balance += curr.refAmount;
      }

      // Track earliest and latest transaction dates
      const txDate = new Date(curr.time).toISOString();
      if (!acc.summary.firstTransactionDate || txDate < acc.summary.firstTransactionDate) {
        acc.summary.firstTransactionDate = txDate;
      }
      if (!acc.summary.lastTransactionDate || txDate > acc.summary.lastTransactionDate) {
        acc.summary.lastTransactionDate = txDate;
      }

      return acc;
    }, getResponseInitialState());

    result.summary.transactionsCount = transactions.length;

    if (budgetDetails.limitAmount) {
      const utilizationRate = (result.summary.actualExpense / budgetDetails.limitAmount) * 100;
      result.summary.utilizationRate = utilizationRate;
    }

    return result;
  },
);
