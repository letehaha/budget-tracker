import * as Accounts from '@models/Accounts.model';
import * as Balances from '@models/Balances.model';
import { Op } from 'sequelize';

import { getWhereConditionForTime } from './utils';

/**
 * Retrieves the balances for the requested account for a user within a specified date range.
 * If no balance record is found for an account between the "from" and "to" dates,
 * and also no record before the "from" date, it checks for records after the "to" date
 * that have a positive balance.
 *
 * @param {Object} params - The parameters for fetching balances.
 * @param {number} params.userId - The ID of the user for whom balances are to be fetched.
 * @param {number} params.accountId - The ID of the account for which balances are to be fetched.
 * @param {string} [params.from] - The start date (inclusive) of the date range in 'yyyy-mm-dd' format.
 * @param {string} [params.to] - The end date (inclusive) of the date range in 'yyyy-mm-dd' format.
 * @returns {Promise<Balances.default[]>} - A promise that resolves to an array of balance records.
 * @throws {Error} - Throws an error if the database query fails.
 *
 * @example
 * const balances = await getBalanceHistoryForAccount({ userId: 1, accountId: 1 from: '2023-01-01', to: '2023-12-31' });
 */
export const getBalanceHistoryForAccount = async ({
  userId,
  from,
  to,
  accountId,
}: {
  userId: number;
  accountId: number;
  from?: string;
  to?: string;
}): Promise<Balances.default[]> => {
  try {
    let data: Balances.default[] = [];

    const dataAttributes = ['date', 'amount'];
    const balancesInRange = await Balances.default.findAll({
      where: getWhereConditionForTime({ from, to, columnName: 'date' }),
      order: [['date', 'ASC']],
      include: [
        {
          model: Accounts.default,
          where: { userId, id: accountId },
          attributes: [],
        },
      ],
      attributes: dataAttributes,
    });

    data = balancesInRange;

    if (!balancesInRange.length) {
      let balanceRecord: Balances.default | undefined = undefined;

      if (from) {
        // Check for records before "from" date
        balanceRecord = (await Balances.default.findOne({
          where: {
            date: {
              [Op.lt]: new Date(from),
            },
            accountId,
          },
          order: [['date', 'DESC']],
          attributes: dataAttributes,
        }))!;
      }

      if (!balanceRecord && to) {
        // If no record found before "from" date, check for records after "to"
        // date with amount > 0
        balanceRecord = (await Balances.default.findOne({
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
        }))!;
      }

      if (balanceRecord) {
        // Combine the results
        data = [
          ...data,
          {
            ...balanceRecord,
            date: new Date(to ?? from ?? new Date()),
          } as Balances.default,
        ];
      }
    }

    return data;
  } catch (err) {
    console.log(err);
    throw err;
  }
};
