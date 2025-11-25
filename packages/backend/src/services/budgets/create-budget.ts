import { BUDGET_STATUSES } from '@bt/shared/types';
import Budgets from '@models/Budget.model';
import BudgetTransactions from '@models/BudgetTransactions.model';
import Transactions from '@models/Transactions.model';
import { withTransaction } from '@services/common/with-transaction';
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
}

const prepareTransactionFilters = (payload: CreateBudgetPayload) => ({
  userId: payload.userId,
  startDate: payload.startDate,
  endDate: payload.endDate,
  autoInclude: payload.autoInclude,
});

export const createBudget = withTransaction(async (payload: CreateBudgetPayload) => {
  const budgetData: CreateBudgetPayload = {
    name: payload.name,
    userId: payload.userId,
    status: payload.status || BUDGET_STATUSES.active,
    startDate: payload.startDate ?? null,
    endDate: payload.endDate ?? null,
    autoInclude: payload.autoInclude ?? false,
    limitAmount: payload.limitAmount ?? null,
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
      transactionIds = transactions.map((t) => t.id);
      await BudgetTransactions.bulkCreate(
        transactionIds.map((transactionId) => ({
          budgetId: budget.id,
          transactionId: transactionId,
        })),
      );
    }
  }

  return budget;
});

const createBudgetModel = async ({
  name,
  status,
  userId,
  startDate,
  endDate,
  autoInclude,
  limitAmount,
}: CreateBudgetPayload) => {
  const budgetData = {
    name,
    userId,
    status: status || BUDGET_STATUSES.active,
    startDate: startDate || null,
    endDate: endDate || null,
    autoInclude: autoInclude ?? false,
    limitAmount: limitAmount ?? null,
  };

  const budget = await Budgets.create(budgetData);
  return budget;
};
