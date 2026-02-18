import { getBalanceHistory } from './get-balance-history';

/**
 * Retrieves the total balance for a user on a specified date.
 *
 * If a transaction is not passed in the attributes, the method will create its
 * own transaction and commit or rollback based on the outcome of the operations.
 *
 * @param {Object} params - The parameters for fetching the total balance.
 * @param {number} params.userId - The ID of the user for whom the total balance is to be fetched.
 * @param {string} params.date - The date in 'yyyy-mm-dd' format for which the total balance is to be calculated.
 * @returns {Promise<number>} - Total balance for asked date.
 * @throws {Error} - Throws an error if the database query fails or if there's an issue with the transaction.
 *
 * @example
 * const total = await getTotalBalance({ userId: 1, date: '2023-01-01' });
 */
export const getTotalBalance = async ({ userId, date }: { userId: number; date: string }): Promise<number> => {
  const balancesForDate = await getBalanceHistory({
    userId,
    from: date,
    to: date,
  });

  // raw: true bypasses MoneyColumn getter, so amount is raw cents integer
  const totalBalance = balancesForDate.reduce((acc, value) => (acc += value.amount as unknown as number), 0);

  return totalBalance;
};
