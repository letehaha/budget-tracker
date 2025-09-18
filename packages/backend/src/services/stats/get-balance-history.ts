import { BalanceModel } from '@bt/shared/types';
import * as Accounts from '@models/Accounts.model';
import * as Balances from '@models/Balances.model';
import { format } from 'date-fns';
import { Op } from 'sequelize';

import { withTransaction } from '../common/with-transaction';
import { getWhereConditionForTime } from './utils';

/**
 * Retrieves the balances for all the accounts for a user within a specified date range.
 * If no balance record is found for an account between the "from" and "to" dates,
 * and also no record before the "from" date, it checks for records after the "to" date
 * that have a positive balance.
 *
 * @param {Object} params - The parameters for fetching balances.
 * @param {number} params.userId - The ID of the user for whom balances are to be fetched.
 * @param {string} [params.from] - The start date (inclusive) of the date range in 'yyyy-mm-dd' format.
 * @param {string} [params.to] - The end date (inclusive) of the date range in 'yyyy-mm-dd' format.
 * @returns {Promise<BalanceModel[]>} - A promise that resolves to an array of balance records.
 * @throws {Error} - Throws an error if the database query fails.
 *
 * @example
 * const balances = await getBalanceHistory({ userId: 1, from: '2023-01-01', to: '2023-12-31' });
 */
export const getBalanceHistory = withTransaction(
  async ({ userId, from, to }: { userId: number; from?: string; to?: string }): Promise<BalanceModel[]> => {
    try {
      let data: BalanceModel[] = [];

      const dataAttributes = ['date', 'amount', 'accountId'];
      // Fetch all balance records within the specified date range for the user
      const balancesInRange = await Balances.default.findAll({
        where: getWhereConditionForTime({ from, to, columnName: 'date' }),
        order: [['date', 'ASC']],
        include: [
          {
            model: Accounts.default,
            where: { userId },
            attributes: [],
          },
        ],
        raw: true,
        attributes: dataAttributes,
      });

      data = balancesInRange;

      // Extract account IDs for balance records which have the same date as the
      // first record in the range. This is needed to make sure that we know the
      // balance for each account for the beginning of the date range
      const accountIdsInRange = balancesInRange
        .filter((item) => item.date === balancesInRange[0]!.date)
        .map((b) => b.accountId);

      // Fetch all accounts for the user
      const allUserAccounts = await Accounts.default.findAll({
        where: { userId },
        attributes: ['id'],
      });
      const allAccountIds = allUserAccounts.map((acc) => acc.id);
      const accountIdsNotInRange = allAccountIds.filter((id) => !accountIdsInRange.includes(id));

      if (accountIdsNotInRange.length) {
        const latestBalancesPromises = accountIdsNotInRange.map(async (accountId) => {
          let balanceRecord;

          if (from) {
            // Check for records before "from" date
            balanceRecord = await Balances.default.findOne({
              where: {
                date: {
                  [Op.lt]: new Date(from),
                },
                accountId,
              },
              order: [['date', 'DESC']],
              attributes: dataAttributes,
              raw: true,
            });
          }

          if (!balanceRecord && to) {
            // If no record found before "from" date, check for records after "to"
            // date with amount > 0
            balanceRecord = await Balances.default.findOne({
              where: {
                accountId,
                date: {
                  [Op.gt]: new Date(to),
                },
                amount: {
                  [Op.gt]: 0,
                },
              },
              order: [['date', 'ASC']],
              attributes: dataAttributes,
              raw: true,
            });
          }

          return balanceRecord;
        });

        const latestBalances = await Promise.all(latestBalancesPromises);

        // Combine the results
        data = [
          ...data,
          // filter(Boolean) to remove any null values
          ...latestBalances.filter(Boolean).map((item) => ({
            ...item,
            // since date is lower than "from", we need to hard-rewrite it to "to" if provided,
            // or "from" otherwise, so it will behave logically correctly
            date: new Date(to ?? from ?? new Date()),
          })),
          // Sort the result ASC
        ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }

      return data;
    } catch (err) {
      console.log(err);
      throw err;
    }
  },
);

interface AggregatedBalanceHistoryItem {
  date: string;
  amount: number;
}

/**
 * Aggregates balance trend data by filling gaps and summing all accounts per date.
 * This is the logic that was previously done on the frontend.
 */
function aggregateBalanceTrendData(data: BalanceModel[]): AggregatedBalanceHistoryItem[] {
  const formatDate = (date: string | Date) => format(new Date(date), 'yyyy-MM-dd');

  if (!data || data.length === 0) {
    return [];
  }

  // Extract unique account IDs and dates from the data.
  const accountIds = new Set(data.map((item) => item.accountId));
  const datesList = new Set(data.map((item) => formatDate(item.date)));

  // Determine the earliest and latest dates in the dataset.
  const sortedDates = Array.from(datesList).sort();
  if (sortedDates.length === 0) {
    return [];
  }
  const firstDate = new Date(sortedDates[0]!);
  const lastDate = new Date(sortedDates[sortedDates.length - 1]!);

  // Generate a list of all dates from the earliest to the latest.
  const allDates: string[] = [];
  for (let dt = new Date(firstDate); dt <= lastDate; dt.setDate(dt.getDate() + 1)) {
    allDates.push(formatDate(dt));
  }

  // Initialize an object to store the filled data per account.
  const filledDataPerAccount: Record<number, Record<string, number>> = {};

  // For each account, find the earliest transaction and fill that
  // transaction's amount for all prior dates in our dataset.
  accountIds.forEach((accountId) => {
    const firstEntry = data
      .filter((item) => item.accountId === accountId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

    if (firstEntry) {
      allDates.forEach((date) => {
        if (new Date(date) <= new Date(firstEntry.date)) {
          if (!filledDataPerAccount[accountId]) filledDataPerAccount[accountId] = {};
          filledDataPerAccount[accountId][date] = firstEntry.amount;
        }
      });
    }
  });

  // For each date, iterate over all accounts. If there's data for an account
  // on the given date, use it. Otherwise, propagate the last known amount for that account.
  allDates.forEach((date) => {
    accountIds.forEach((accountId) => {
      if (!filledDataPerAccount[accountId]) filledDataPerAccount[accountId] = {};

      const currentEntry = data.find((item) => item.accountId === accountId && formatDate(item.date) === date);
      if (currentEntry) {
        filledDataPerAccount[accountId][date] = currentEntry.amount;
      } else if (!filledDataPerAccount[accountId][date]) {
        const previousDate = new Date(date);
        previousDate.setDate(previousDate.getDate() - 1);
        filledDataPerAccount[accountId][date] = filledDataPerAccount[accountId][formatDate(previousDate)] || 0;
      }
    });
  });

  // Sum the amounts for all accounts on each date to get the
  // aggregate amount for each date in the dataset.
  const aggregatedData = Object.keys(filledDataPerAccount).reduce(
    (acc, accountId) => {
      const accountData = filledDataPerAccount[Number(accountId)];
      if (accountData) {
        for (const [date, amount] of Object.entries(accountData)) {
          acc[date] = (acc[date] || 0) + (amount as number);
        }
      }
      return acc;
    },
    {} as Record<string, number>,
  );

  // Convert the aggregated data from an object to an array of objects.
  const result = Object.entries(aggregatedData)
    .map(([date, amount]) => ({
      date,
      amount,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return result;
}

/**
 * Retrieves aggregated balance history for all user's accounts within a specified date range.
 * This version aggregates all accounts by date and fills gaps, providing the data ready for frontend consumption.
 *
 * @param {Object} params - The parameters for fetching aggregated balances.
 * @param {number} params.userId - The ID of the user for whom balances are to be fetched.
 * @param {string} [params.from] - The start date (inclusive) of the date range in 'yyyy-mm-dd' format.
 * @param {string} [params.to] - The end date (inclusive) of the date range in 'yyyy-mm-dd' format.
 * @returns {Promise<AggregatedBalanceHistoryItem[]>} - A promise that resolves to an array of aggregated balance records.
 */
export const getAggregatedBalanceHistory = withTransaction(
  async (...args: Parameters<typeof getBalanceHistory>): Promise<AggregatedBalanceHistoryItem[]> => {
    const rawBalanceHistory = await getBalanceHistory(...args);

    return aggregateBalanceTrendData(rawBalanceHistory);
  },
);
