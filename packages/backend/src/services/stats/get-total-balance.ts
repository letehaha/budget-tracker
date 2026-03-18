import { getBalanceHistory } from './get-balance-history';
import { getCreditLimitAdjustment } from './get-credit-limit-adjustment';

/**
 * Retrieves the total balance for a user on a specified date.
 *
 * When `includeCreditLimit` is true, subtracts the total credit limit
 * (in base currency) from the balance so credit card available credit
 * does not inflate the total.
 *
 * @param {Object} params - The parameters for fetching the total balance.
 * @param {number} params.userId - The ID of the user for whom the total balance is to be fetched.
 * @param {string} params.date - The date in 'yyyy-mm-dd' format for which the total balance is to be calculated.
 * @param {boolean} [params.includeCreditLimit] - Whether to subtract credit limits from the total.
 * @returns {Promise<number>} - Total balance for asked date (in cents).
 */
export const getTotalBalance = async ({
  userId,
  date,
  includeCreditLimit = false,
}: {
  userId: number;
  date: string;
  includeCreditLimit?: boolean;
}): Promise<number> => {
  const [balancesForDate, creditLimitSum] = await Promise.all([
    getBalanceHistory({ userId, from: date, to: date }),
    includeCreditLimit ? getCreditLimitAdjustment({ userId }) : Promise.resolve(0),
  ]);

  const totalBalance = balancesForDate.reduce((acc, value) => (acc += value.amount.toCents()), 0);

  return totalBalance - creditLimitSum;
};
