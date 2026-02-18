import { BUDGET_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { t } from '@i18n/index';
import { NotFoundError, ValidationError } from '@js/errors';
import Budgets from '@models/Budget.model';
import Categories from '@models/Categories.model';
import TransactionSplits from '@models/TransactionSplits.model';
import * as Transactions from '@models/Transactions.model';
import { Op } from 'sequelize';

import { buildDateFilter } from './utils/build-date-filter';

/**
 * Get transactions for a category-based budget.
 * Returns transactions that match the budget's categories, handling split transactions
 * by returning only the matching split portion.
 */
export const getCategoryBudgetTransactions = async ({
  userId,
  budgetId,
  from = 0,
  limit = 50,
}: GetCategoryBudgetTransactionsParams) => {
  const budget = await Budgets.findByPk(budgetId, {
    include: [{ model: Categories, as: 'categories', attributes: ['id', 'name', 'color'] }],
  });

  if (!budget) {
    throw new NotFoundError({ message: t({ key: 'budgets.budgetNotFound' }) });
  }

  if (budget.type !== BUDGET_TYPES.category) {
    throw new ValidationError({ message: t({ key: 'budgets.notCategoryBudget' }) });
  }

  const categoryIds = budget.categories?.map((c) => c.id) || [];

  if (!categoryIds.length) {
    return { transactions: [], total: 0 };
  }

  const dateFilter = buildDateFilter({
    startDate: budget.startDate,
    endDate: budget.endDate,
  });

  // Get transactions where primary category matches and have no splits
  const primaryCategoryTransactions = await Transactions.default.findAll({
    where: {
      userId,
      categoryId: { [Op.in]: categoryIds },
      transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
      ...dateFilter,
    },
    include: [
      { model: TransactionSplits, as: 'splits', required: false },
      { model: Categories, as: 'category', attributes: ['id', 'name', 'color'] },
    ],
    order: [['time', 'DESC']],
    raw: false,
  });

  // Get splits that match the categories
  const matchingSplits = await TransactionSplits.findAll({
    where: {
      userId,
      categoryId: { [Op.in]: categoryIds },
    },
    include: [
      {
        model: Transactions.default,
        as: 'transaction',
        where: {
          transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
          ...dateFilter,
        },
        attributes: ['id', 'time', 'transactionType', 'note', 'accountId'],
      },
      {
        model: Categories,
        as: 'category',
        attributes: ['id', 'name', 'color'],
      },
    ],
  });

  // Combine results
  const results: TransactionWithCategory[] = [];
  const seenTransactionIds = new Set<number>();

  // Process primary category transactions (only those WITHOUT splits)
  for (const tx of primaryCategoryTransactions) {
    const splits = tx.get('splits') as TransactionSplits[] | undefined;
    const category = tx.get('category') as Categories | undefined;

    // If transaction has splits, skip it here - we'll include split entries separately
    if (splits && splits.length > 0) {
      continue;
    }

    seenTransactionIds.add(tx.id);
    results.push({
      id: tx.id,
      time: tx.time,
      transactionType: tx.transactionType,
      refAmount: tx.refAmount.toNumber(),
      amount: tx.amount.toNumber(),
      note: tx.note,
      categoryId: tx.categoryId,
      accountId: tx.accountId,
      effectiveCategory: category
        ? {
            id: category.id,
            name: category.name,
            color: category.color,
          }
        : undefined,
      effectiveRefAmount: tx.refAmount.toNumber(),
    });
  }

  // Process splits - add each matching split as a separate entry
  for (const split of matchingSplits) {
    const transaction = split.get('transaction') as Transactions.default;
    const category = split.get('category') as Categories | undefined;

    if (!transaction) continue;

    results.push({
      id: transaction.id,
      time: transaction.time,
      transactionType: transaction.transactionType,
      refAmount: split.refAmount.toNumber(),
      amount: split.amount.toNumber(),
      note: transaction.note,
      categoryId: split.categoryId,
      accountId: transaction.accountId,
      effectiveCategory: category
        ? {
            id: category.id,
            name: category.name,
            color: category.color,
          }
        : undefined,
      effectiveRefAmount: split.refAmount.toNumber(),
    });

    seenTransactionIds.add(transaction.id);
  }

  // Sort by time DESC
  results.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  const total = results.length;
  const paginatedResults = results.slice(from, from + limit);

  return {
    transactions: paginatedResults,
    total,
  };
};

interface TransactionWithCategory {
  id: number;
  time: Date;
  transactionType: TRANSACTION_TYPES;
  refAmount: number;
  amount: number;
  note: string | null;
  categoryId: number | null;
  accountId: number;
  /** For split transactions, this is the split's category */
  effectiveCategory?: {
    id: number;
    name: string;
    color: string;
  };
  /** For split transactions, this is the split amount */
  effectiveRefAmount?: number;
}

interface GetCategoryBudgetTransactionsParams {
  userId: number;
  budgetId: number;
  from?: number;
  limit?: number;
}
