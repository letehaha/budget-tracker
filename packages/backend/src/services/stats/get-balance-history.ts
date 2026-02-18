import * as Accounts from '@models/Accounts.model';
import * as Balances from '@models/Balances.model';
import { format } from 'date-fns';
import { Op } from 'sequelize';

import { getWhereConditionForTime } from './utils';

function formatDate(date: string | Date): string {
  return format(new Date(date), 'yyyy-MM-dd');
}

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
 * @returns {Promise<Balances.default[]>} - A promise that resolves to an array of balance records.
 * @throws {Error} - Throws an error if the database query fails.
 *
 * @example
 * const balances = await getBalanceHistory({ userId: 1, from: '2023-01-01', to: '2023-12-31' });
 */
export const getBalanceHistory = async ({
  userId,
  from,
  to,
}: {
  userId: number;
  from?: string;
  to?: string;
}): Promise<Balances.default[]> => {
  const dataAttributes = ['date', 'amount', 'accountId'];

  const [allUserAccounts, balancesInRange] = await Promise.all([
    Accounts.default.findAll({
      where: { userId, isEnabled: true },
      attributes: ['id'],
    }),
    Balances.default.findAll({
      where: getWhereConditionForTime({ from, to, columnName: 'date' }),
      order: [['date', 'ASC']],
      include: [
        {
          model: Accounts.default,
          where: { userId, isEnabled: true },
          attributes: [],
        },
      ],
      attributes: dataAttributes,
    }) as Promise<Balances.default[]>,
  ]);

  let data = balancesInRange;
  const allAccountIds = allUserAccounts.map((acc) => acc.id);

  // Extract account IDs for balance records which have the same date as the
  // first record in the range. This is needed to make sure that we know the
  // balance for each account for the beginning of the date range
  const accountIdsInRange = balancesInRange
    .filter((item) => item.date === balancesInRange[0]?.date)
    .map((b) => b.accountId);

  const accountIdsNotInRange = allAccountIds.filter((id) => !accountIdsInRange.includes(id));

  if (accountIdsNotInRange.length && (from || to)) {
    const [balancesBeforeFrom, balancesAfterTo] = await Promise.all([
      // Get latest balance before 'from' date for each missing account
      from
        ? Balances.default.findAll({
            where: {
              accountId: { [Op.in]: accountIdsNotInRange },
              date: { [Op.lt]: new Date(from) },
            },
            attributes: [...dataAttributes, 'id'],
          })
        : Promise.resolve([]),
      // Get earliest balance after 'to' date with amount > 0 for each missing account
      to
        ? Balances.default.findAll({
            where: {
              accountId: { [Op.in]: accountIdsNotInRange },
              date: { [Op.gt]: new Date(to) },
            },
            attributes: [...dataAttributes, 'id'],
          })
        : Promise.resolve([]),
    ]);

    // Pre-group balances by accountId using Maps for O(1) lookup
    const beforeByAccount = new Map<number, Balances.default[]>();
    for (const b of balancesBeforeFrom) {
      const items = beforeByAccount.get(b.accountId);
      if (items) {
        items.push(b);
      } else {
        beforeByAccount.set(b.accountId, [b]);
      }
    }

    const afterByAccount = new Map<number, Balances.default[]>();
    for (const b of balancesAfterTo) {
      const items = afterByAccount.get(b.accountId);
      if (items) {
        items.push(b);
      } else {
        afterByAccount.set(b.accountId, [b]);
      }
    }

    // Sort once per account (descending for "before", ascending for "after")
    for (const items of beforeByAccount.values()) {
      items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    for (const items of afterByAccount.values()) {
      items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    // For each missing account, find the latest "before" or earliest "after" balance
    const latestBalances: Balances.default[] = [];
    const overrideDate = new Date(to ?? from ?? new Date());

    for (const accountId of accountIdsNotInRange) {
      const beforeBalances = beforeByAccount.get(accountId);
      if (beforeBalances && beforeBalances.length > 0) {
        latestBalances.push({ ...beforeBalances[0]!, date: overrideDate } as Balances.default);
        continue;
      }

      const afterBalances = afterByAccount.get(accountId);
      if (afterBalances && afterBalances.length > 0) {
        latestBalances.push({ ...afterBalances[0]!, date: overrideDate } as Balances.default);
      }
    }

    // Combine results
    data = [...data, ...latestBalances].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  return data;
};

interface AggregatedBalanceHistoryItem {
  date: string;
  amount: number;
}

/**
 * Aggregates balance trend data by filling gaps and summing all accounts per date.
 * This is the logic that was previously done on the frontend.
 */
function aggregateBalanceTrendData(
  data: Balances.default[],
  from?: string,
  to?: string,
): AggregatedBalanceHistoryItem[] {
  if (!data || data.length === 0) {
    return [];
  }

  // Extract unique account IDs and dates from the data.
  const accountIds = new Set(data.map((item) => item.accountId));
  const datesList = new Set(data.map((item) => formatDate(item.date)));

  // Determine the earliest and latest dates in the dataset.
  const sortedDates = Array.from(datesList).sort();

  // Use requested from/to dates if provided, otherwise use data range
  const firstDate = from ? new Date(from) : new Date(sortedDates[0]!);
  const lastDate = to ? new Date(to) : new Date(sortedDates[sortedDates.length - 1]!);

  // Generate a list of all dates from the earliest to the latest.
  const allDates: string[] = [];
  for (let dt = new Date(firstDate); dt <= lastDate; dt.setDate(dt.getDate() + 1)) {
    allDates.push(formatDate(dt));
  }

  // Build lookup Maps in a single pass:
  // - dataByAccountAndDate: "accountId_date" -> amount for O(1) access
  // - dataByAccount: accountId -> Balances.default[] for efficient first entry lookup
  const dataByAccountAndDate = new Map<string, number>();
  const dataByAccount = new Map<number, Balances.default[]>();
  for (const item of data) {
    dataByAccountAndDate.set(`${item.accountId}_${formatDate(item.date)}`, item.amount.toCents());

    const accountItems = dataByAccount.get(item.accountId);
    if (accountItems) {
      accountItems.push(item);
    } else {
      dataByAccount.set(item.accountId, [item]);
    }
  }

  // Sort each account's data by date (once, not in the loop)
  for (const [, accountData] of dataByAccount) {
    accountData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  // Initialize an object to store the filled data per account.
  const filledDataPerAccount: Record<number, Record<string, number>> = {};

  // For each account, find the earliest transaction and fill that
  // transaction's amount for all prior dates in our dataset.
  for (const accountId of accountIds) {
    const firstEntry = dataByAccount.get(accountId)?.[0]; // Already sorted, first is earliest
    if (!firstEntry) continue;

    const firstEntryDateStr = formatDate(firstEntry.date);
    filledDataPerAccount[accountId] = {};

    for (const date of allDates) {
      if (date > firstEntryDateStr) break; // dates are sorted, no need to continue
      filledDataPerAccount[accountId][date] = firstEntry.amount.toCents();
    }
  }

  // For each date, iterate over all accounts. If there's data for an account
  // on the given date, use it. Otherwise, propagate the last known amount for that account.
  for (const date of allDates) {
    for (const accountId of accountIds) {
      if (!filledDataPerAccount[accountId]) filledDataPerAccount[accountId] = {};

      // O(1) Map lookup instead of O(n) find
      const currentAmount = dataByAccountAndDate.get(`${accountId}_${date}`);
      if (currentAmount !== undefined) {
        filledDataPerAccount[accountId][date] = currentAmount;
      } else if (!filledDataPerAccount[accountId][date]) {
        const previousDate = new Date(date);
        previousDate.setDate(previousDate.getDate() - 1);
        filledDataPerAccount[accountId][date] = filledDataPerAccount[accountId][formatDate(previousDate)] || 0;
      }
    }
  }

  // Sum the amounts for all accounts on each date to get the
  // aggregate amount for each date in the dataset.
  const aggregatedData = Object.keys(filledDataPerAccount).reduce(
    (acc, accountId) => {
      const accountData = filledDataPerAccount[Number(accountId)];
      if (accountData) {
        for (const [date, amount] of Object.entries(accountData)) {
          acc[date] = (acc[date] || 0) + amount;
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
export const getAggregatedBalanceHistory = async ({
  userId,
  from,
  to,
}: {
  userId: number;
  from: string;
  to: string;
}): Promise<AggregatedBalanceHistoryItem[]> => {
  const rawBalanceHistory = await getBalanceHistory({ userId, from, to });

  return aggregateBalanceTrendData(rawBalanceHistory, from, to);
};
