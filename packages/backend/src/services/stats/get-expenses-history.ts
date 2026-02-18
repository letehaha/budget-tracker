import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { removeUndefinedKeys } from '@js/helpers';
import Accounts from '@models/Accounts.model';
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

  const transactions = await Transactions.default.findAll({
    where: removeUndefinedKeys({
      accountId,
      userId,
      transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
      transactionType,
      categoryId: {
        [Op.notIn]: excludedCategories,
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
    raw: true,
    attributes: dataAttributes,
  });

  return transactions;
};
