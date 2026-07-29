import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { removeUndefinedKeys } from '@js/helpers';
import Accounts from '@models/accounts.model';
import * as Transactions from '@models/transactions.model';

import { getWhereConditionForTime } from './utils';

type GetExpensesHistoryResponseSchema = Pick<
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
 * Category scoping (selected and hidden categories alike) is left to the caller: a transaction can
 * split across several categories, so a row that looks irrelevant by its own `categoryId` may still
 * carry legs that belong in the report.
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
  accountId?: string;
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

  const transactions = await Transactions.default.findAll({
    where: removeUndefinedKeys({
      accountId,
      userId,
      transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
      transactionType,
      ...getWhereConditionForTime({ from, to, columnName: 'time' }),
    }),
    include: [
      {
        model: Accounts,
        where: { excludeFromStats: false },
        attributes: [],
      },
    ],
    order: [['time', 'ASC']],
    attributes: dataAttributes,
  });

  return transactions;
};
