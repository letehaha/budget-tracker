import { BalanceModel } from '@bt/shared/types';
import * as Accounts from '@models/Accounts.model';
import * as Balances from '@models/Balances.model';
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
