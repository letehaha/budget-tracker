import { ACCOUNT_CATEGORIES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import * as Accounts from '@models/accounts.model';
import * as Balances from '@models/balances.model';
import { format } from 'date-fns';
import { Op, WhereOptions } from 'sequelize';

import { getWhereConditionForTime } from './utils';

interface AccountCategoryFilter {
  /** Exclude these categories from the result. Mutually exclusive with `only`. */
  exclude?: ACCOUNT_CATEGORIES[];
  /** Include only these categories. Mutually exclusive with `exclude`. */
  only?: ACCOUNT_CATEGORIES[];
}

/**
 * Balance row fetched with `raw: true` — a deliberate exception to the
 * "no raw on Money queries" rule: Balances has one row per account per day,
 * so per-row Sequelize instances + Money objects dominate dashboard-load memory.
 * `amount` is cents (BIGINT; the global INT8 parser in models/index.ts yields
 * JS numbers). Money is constructed only at the public `getBalanceHistory` boundary.
 */
interface BalanceHistoryRow {
  date: string | Date;
  amount: number;
  accountId: string;
}

function buildAccountWhere({
  userId,
  categoryFilter,
}: {
  userId: number;
  categoryFilter?: AccountCategoryFilter;
}): WhereOptions {
  const where: Record<string, unknown> = { userId, excludeFromStats: false };
  if (categoryFilter?.only?.length) {
    where.accountCategory = { [Op.in]: categoryFilter.only };
  } else if (categoryFilter?.exclude?.length) {
    where.accountCategory = { [Op.notIn]: categoryFilter.exclude };
  }
  return where;
}

function formatDate(date: string | Date): string {
  return format(new Date(date), 'yyyy-MM-dd');
}

/**
 * Fetches the balance rows for all the accounts for a user within a specified date range.
 * If no balance record is found for an account between the "from" and "to" dates,
 * and also no record before the "from" date, it checks for records after the "to" date
 * that have a positive balance.
 */
const getBalanceHistoryRows = async ({
  userId,
  from,
  to,
  categoryFilter,
}: {
  userId: number;
  from?: string;
  to?: string;
  categoryFilter?: AccountCategoryFilter;
}): Promise<BalanceHistoryRow[]> => {
  const dataAttributes = ['date', 'amount', 'accountId'];
  const accountWhere = buildAccountWhere({ userId, categoryFilter });

  const [allUserAccounts, balancesInRange] = await Promise.all([
    Accounts.default.findAll({
      where: accountWhere,
      attributes: ['id'],
    }),
    Balances.default.findAll({
      where: getWhereConditionForTime({ from, to, columnName: 'date' }),
      // `accountId` as secondary sort to make ties deterministic across query
      // plans. Without it, Postgres returns same-date rows in whatever order
      // the chosen access path produces (heap order under a seq scan, index
      // order under the `(accountId, date)` unique index), which differs
      // between environments and across schema changes.
      order: [
        ['date', 'ASC'],
        ['accountId', 'ASC'],
      ],
      include: [
        {
          model: Accounts.default,
          where: accountWhere,
          attributes: [],
        },
      ],
      attributes: dataAttributes,
      raw: true,
    }) as unknown as Promise<BalanceHistoryRow[]>,
  ]);

  let data = balancesInRange;
  const allAccountIds = allUserAccounts.map((acc) => acc.id);

  // Identify accounts that have NO balance records at all within the requested range.
  // These accounts need a backfill entry from their latest pre-range (or earliest post-range)
  // balance so the aggregation includes them.
  //
  // Accounts that DO have records in the range (even if not on the first date) are handled
  // correctly by the aggregation's forward-fill logic — their first in-range value is used
  // for all prior dates. We intentionally skip backfilling these accounts to avoid creating
  // phantom balance spikes when the pre-range balance differs from the first in-range value
  // (e.g., an account was $8,500 before the range but $0 on its first in-range record).
  const accountIdsWithRecordsInRange = new Set(balancesInRange.map((b) => b.accountId));
  const accountIdsWithNoRecords = allAccountIds.filter((id) => !accountIdsWithRecordsInRange.has(id));

  if (accountIdsWithNoRecords.length && (from || to)) {
    const [balancesBeforeFrom, balancesAfterTo] = await Promise.all([
      // Get latest balance before 'from' date for each missing account
      from
        ? (Balances.default.findAll({
            where: {
              accountId: { [Op.in]: accountIdsWithNoRecords },
              date: { [Op.lt]: new Date(from) },
            },
            attributes: dataAttributes,
            raw: true,
          }) as unknown as Promise<BalanceHistoryRow[]>)
        : Promise.resolve<BalanceHistoryRow[]>([]),
      // Get earliest balance after 'to' date for each missing account
      to
        ? (Balances.default.findAll({
            where: {
              accountId: { [Op.in]: accountIdsWithNoRecords },
              date: { [Op.gt]: new Date(to) },
            },
            attributes: dataAttributes,
            raw: true,
          }) as unknown as Promise<BalanceHistoryRow[]>)
        : Promise.resolve<BalanceHistoryRow[]>([]),
    ]);

    // Pre-group balances by accountId using Maps for O(1) lookup
    const beforeByAccount = new Map<string, BalanceHistoryRow[]>();
    for (const b of balancesBeforeFrom) {
      const items = beforeByAccount.get(b.accountId);
      if (items) {
        items.push(b);
      } else {
        beforeByAccount.set(b.accountId, [b]);
      }
    }

    const afterByAccount = new Map<string, BalanceHistoryRow[]>();
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

    // For each account with no records in the range, find the latest "before" or
    // earliest "after" balance. Inject at `from` so the aggregation forward-fills
    // this balance across the entire range.
    const latestBalances: BalanceHistoryRow[] = [];
    const overrideDate = new Date(from ?? to ?? new Date());

    for (const accountId of accountIdsWithNoRecords) {
      const beforeBalances = beforeByAccount.get(accountId);
      if (beforeBalances && beforeBalances.length > 0) {
        const b = beforeBalances[0]!;
        latestBalances.push({
          accountId: b.accountId,
          amount: b.amount,
          date: overrideDate,
        });
        continue;
      }

      const afterBalances = afterByAccount.get(accountId);
      if (afterBalances && afterBalances.length > 0) {
        const b = afterBalances[0]!;
        latestBalances.push({
          accountId: b.accountId,
          amount: b.amount,
          date: overrideDate,
        });
      }
    }

    // Combine results — same `(date, accountId)` order as the main query so
    // the merged stream stays deterministic.
    data = [...data, ...latestBalances].toSorted((a, b) => {
      const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.accountId.localeCompare(b.accountId);
    });
  }

  return data;
};

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
  categoryFilter,
}: {
  userId: number;
  from?: string;
  to?: string;
  categoryFilter?: AccountCategoryFilter;
}): Promise<Balances.default[]> => {
  const rows = await getBalanceHistoryRows({ userId, from, to, categoryFilter });

  // Plain objects (not Sequelize instances) with Money amounts — consumers
  // (stats serializer, getTotalBalance) only read `date`, `amount`, `accountId`.
  return rows.map(
    (row) =>
      ({
        date: row.date,
        amount: Money.fromCents(row.amount),
        accountId: row.accountId,
      }) as unknown as Balances.default,
  );
};

interface AggregatedBalanceHistoryItem {
  date: string;
  amount: number;
}

/**
 * Aggregates balance trend data by filling gaps and summing all accounts per date.
 */
function aggregateBalanceTrendData({
  data,
  from,
  to,
  openingCentsByAccount,
}: {
  data: BalanceHistoryRow[];
  from?: string;
  to?: string;
  openingCentsByAccount?: Map<string, number>;
}): AggregatedBalanceHistoryItem[] {
  if (!data || data.length === 0) {
    return [];
  }

  // Extract unique account IDs and dates from the data.
  const accountIds = new Set(data.map((item) => item.accountId));
  const datesList = new Set(data.map((item) => formatDate(item.date)));

  // Determine the earliest and latest dates in the dataset.
  const sortedDates = Array.from(datesList).toSorted();

  // Use requested from/to dates if provided, otherwise use data range
  const firstDate = from ? new Date(from) : new Date(sortedDates[0]!);
  const lastDate = to ? new Date(to) : new Date(sortedDates[sortedDates.length - 1]!);

  // Generate a list of all dates from the earliest to the latest.
  const allDates: string[] = [];
  // oxlint-disable-next-line no-unmodified-loop-condition -- dt is mutated via setDate()
  for (let dt = new Date(firstDate); dt <= lastDate; dt.setDate(dt.getDate() + 1)) {
    allDates.push(formatDate(dt));
  }

  // Build lookup Maps in a single pass:
  // - centsByAccountAndDate: "accountId_date" -> cents for O(1) access
  // - earliestRowByAccount: accountId -> earliest row's (date, cents), used for back-fill
  const centsByAccountAndDate = new Map<string, number>();
  const earliestRowByAccount = new Map<string, { dateStr: string; cents: number }>();
  for (const item of data) {
    const dateStr = formatDate(item.date);
    centsByAccountAndDate.set(`${item.accountId}_${dateStr}`, item.amount);

    const earliest = earliestRowByAccount.get(item.accountId);
    if (!earliest || dateStr < earliest.dateStr) {
      earliestRowByAccount.set(item.accountId, { dateStr, cents: item.amount });
    }
  }

  // Forward-fill each account across all dates while summing straight into a
  // single per-date total, so no per-account day map is ever materialized.
  const totalCentsByDate = new Map<string, number>();

  for (const accountId of accountIds) {
    const earliest = earliestRowByAccount.get(accountId);
    if (!earliest) continue;

    // An optional opening balance back-fills the dates STRICTLY BEFORE the
    // account's earliest record. Loans pass their `initialBalance` here (the
    // outstanding as-of the anchor date) so a payoff dated on the anchor day —
    // which folds the anchor-day row toward zero — can't retroactively rewrite
    // the outstanding shown on earlier days. `initialBalance` never changes on
    // payment, so pre-anchor days stay stable. The earliest record's own date
    // always keeps its real value.
    const openingCents = openingCentsByAccount?.get(accountId);
    let currentCents = 0;

    for (const date of allDates) {
      const actualCents = centsByAccountAndDate.get(`${accountId}_${date}`);
      if (actualCents !== undefined) {
        currentCents = actualCents;
      } else if (date < earliest.dateStr) {
        currentCents = openingCents !== undefined ? openingCents : earliest.cents;
      } else if (date === earliest.dateStr) {
        currentCents = earliest.cents;
      }
      // Dates after the earliest record with no row keep the previous day's value.

      totalCentsByDate.set(date, (totalCentsByDate.get(date) ?? 0) + currentCents);
    }
  }

  // `allDates` is already ascending, so the result is sorted by date.
  return allDates.map((date) => ({
    date,
    amount: totalCentsByDate.get(date) ?? 0,
  }));
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
  categoryFilter,
  openingCentsByAccount,
}: {
  userId: number;
  from: string;
  to: string;
  categoryFilter?: AccountCategoryFilter;
  /**
   * Per-account opening balance (cents) used to back-fill dates before an
   * account's earliest record. Supplied for the loan partition so same-day
   * payoffs can't retroactively move earlier days (see aggregateBalanceTrendData).
   */
  openingCentsByAccount?: Map<string, number>;
}): Promise<AggregatedBalanceHistoryItem[]> => {
  const rawBalanceHistory = await getBalanceHistoryRows({ userId, from, to, categoryFilter });

  return aggregateBalanceTrendData({ data: rawBalanceHistory, from, to, openingCentsByAccount });
};
