import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { removeUndefinedKeys } from '@js/helpers';
import Accounts from '@models/Accounts.model';
import * as Categories from '@models/Categories.model';
import * as Transactions from '@models/Transactions.model';
import { Op } from 'sequelize';

import { getUserSettings } from '../user-settings/get-user-settings';
import { getWhereConditionForTime } from './utils';

export type GetExpensesHistoryResponseSchema = Pick<
  Transactions.default,
  | 'id'
  | 'accountId'
  | 'time'
  | 'amount'
  | 'refAmount'
  | 'currencyCode'
  | 'categoryId'
  | 'refundLinked'
  | 'transactionType'
>;

/**
 * Fetches the expense history for a specified user within an optional date range and account.
 *
 * @param {Object} params - The parameters for fetching balances.
 * @param {number} params.userId - The ID of the user for whom balances are to be fetched.
 * @param {string} [params.from] - The start date (inclusive) of the date range in 'yyyy-mm-dd' format.
 * @param {string} [params.to] - The end date (inclusive) of the date range in 'yyyy-mm-dd' format.
 * @param {string} [params.accountId] - Load history for asked account.
 * @returns {Promise<BalanceModel[]>} - A promise that resolves to an array of expenses records.
 * @throws {Error} - Throws an error if the database query fails.
 *
 * @example
 * const balances = await getExpensesHistory({ userId: 1, from: '2023-01-01', to: '2023-12-31' });
 */
export const getExpensesHistory = async ({
  userId,
  from,
  to,
  accountId,
  transactionType = TRANSACTION_TYPES.expense,
}: {
  userId: number;
  accountId?: number;
  from?: string;
  to?: string;
  transactionType?: TRANSACTION_TYPES;
}): Promise<GetExpensesHistoryResponseSchema[]> => {
  const dataAttributes: (keyof Transactions.default)[] = [
    'id',
    'accountId',
    'time',
    'amount',
    'refAmount',
    'currencyCode',
    'categoryId',
    'refundLinked',
    'transactionType',
  ];

  const settings = await getUserSettings({ userId });

  const excludedCategories = settings.stats.expenses.excludedCategories;

  // Expand excluded categories to include all descendant sub-categories
  let allExcludedCategoryIds = excludedCategories;
  if (excludedCategories.length > 0) {
    const allCategories = await Categories.default.findAll({
      where: { userId },
      attributes: ['id', 'parentId'],
      raw: true,
    });

    const excludedSet = new Set<number>(excludedCategories);

    // For each category, check if any ancestor is excluded
    for (const cat of allCategories) {
      let currentParentId: number | null = cat.parentId;
      while (currentParentId !== null) {
        if (excludedSet.has(currentParentId)) {
          excludedSet.add(cat.id);
          break;
        }
        const parent = allCategories.find((c) => c.id === currentParentId);
        currentParentId = parent?.parentId ?? null;
      }
    }

    allExcludedCategoryIds = Array.from(excludedSet);
  }

  const transactions = await Transactions.default.findAll({
    where: removeUndefinedKeys({
      accountId,
      userId,
      transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
      transactionType,
      categoryId: {
        [Op.notIn]: allExcludedCategoryIds,
      },
      ...getWhereConditionForTime({ from, to, columnName: 'time' }),
    }),
    include: [
      {
        model: Accounts,
        where: { isEnabled: true },
        attributes: [],
      },
    ],
    order: [['time', 'ASC']],
    attributes: dataAttributes,
  });

  return transactions;
};
