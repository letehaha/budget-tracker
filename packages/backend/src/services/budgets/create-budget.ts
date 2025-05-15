
import { withTransaction } from '@services/common/index';
import Budgets from '@models/Budget.model';
import Transactions from '@models/Transactions.model';
import BudgetTransactions from '@models/BudgetTransactions.model';
import { Op } from 'sequelize';

export interface CreateBudgetPayload {
  id?: number;
  userId: number;
  name: string;
  status: string;
  categoryName?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  autoInclude?: boolean;
  limitAmount?: number | null;
  // categoriesIds?: number | null;
}

const prepareTransactionFilters = (payload: CreateBudgetPayload) => ({
  userId: payload.userId,
  startDate: payload.startDate,
  endDate: payload.endDate,
  autoInclude: payload.autoInclude,
  // categoriesIds: payload.categoriesIds || undefined,
});

export const createBudget = withTransaction(async (payload: CreateBudgetPayload) => {
  if (!payload.name || !payload.userId) {
    throw new Error('Name and userId are required fields');
  }

  if (payload.startDate && payload.endDate && payload.startDate > payload.endDate) {
    throw new Error('Start date cannot be later than end date');
  }

  const budgetData: CreateBudgetPayload = {
    name: payload.name,
    userId: payload.userId,
    status: payload.status || 'active',
    // categoryName: payload.categoryName || '',
    startDate: payload.startDate ?? null,
    endDate: payload.endDate ?? null,
    autoInclude: payload.autoInclude ?? false,
    limitAmount: payload.limitAmount ?? null,
    // categoriesIds: payload.categoriesIds ?? null,
  };

  const budget = await createBudgetModel(budgetData);

  let transactionIds: number[] = [];
  if (payload.autoInclude && payload.startDate && payload.endDate) {
    const transactionFilters = prepareTransactionFilters(budgetData);
    const transactions = await Transactions.findAll({
      where: {
        userId: transactionFilters.userId,
        time: {
          [Op.between]: [transactionFilters.startDate, transactionFilters.endDate],
        },
      },
    });

    if (transactions.length) {
      transactionIds = transactions.map(t => t.id);
      await BudgetTransactions.bulkCreate(
        transactionIds.map(transactionId => ({
          budgetId: budget.id,
          transactionId: transactionId,
        }))
      );
    }
  }

  return budget
});

const createBudgetModel = async ({
  name,
  status,
  // categoryName,
  userId,
  startDate,
  endDate,
  autoInclude,
  limitAmount,
  // categoriesIds,
}: CreateBudgetPayload) => {
  if (!name || !userId) {
    throw new Error('Name and userId are required fields');
  }

  const budgetData = {
    name,
    userId,
    status: status || 'active',
    // categoryName: categoryName || '',
    startDate: startDate || null,
    endDate: endDate || null,
    autoInclude: autoInclude ?? false,
    limitAmount: limitAmount ?? null,
    // categoriesIds: categoriesIds ?? null,
  };

  if (startDate && endDate && startDate > endDate) {
    throw new Error('Start date cannot be later than end date');
  }

  const budget = await Budgets.create(budgetData);
  return budget;
};
