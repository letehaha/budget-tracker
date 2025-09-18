import { toSystemAmount } from '@js/helpers/system-amount';
import { format, parseISO } from 'date-fns';

import { withTransaction } from '../common/with-transaction';
import { getPortfolioValuesForDateRange } from '../investments/portfolios/historical-value.service';
import { listPortfolios } from '../investments/portfolios/list.service';
import { getAggregatedBalanceHistory } from './get-balance-history';

export interface CombinedBalanceHistoryItem {
  date: string;
  accountsBalance: number;
  portfoliosBalance: number;
  totalBalance: number;
}

/**
 * Retrieves combined balance history for accounts and portfolios for a user within a specified date range.
 * Returns daily balance snapshots with accounts balance, portfolios balance, and total balance.
 *
 * Uses accurate historical portfolio calculations based on transaction history and daily prices.
 * Portfolio values are cached for performance with 30-day TTL.
 *
 * @param {Object} params - The parameters for fetching combined balance history.
 * @param {number} params.userId - The ID of the user for whom balances are to be fetched.
 * @param {string} [params.from] - The start date (inclusive) of the date range in 'yyyy-mm-dd' format.
 * @param {string} [params.to] - The end date (inclusive) of the date range in 'yyyy-mm-dd' format.
 * @returns {Promise<CombinedBalanceHistoryItem[]>} - A promise that resolves to an array of combined balance records.
 * @throws {Error} - Throws an error if the database query fails.
 */
export const getCombinedBalanceHistory = withTransaction(
  async ({
    userId,
    from,
    to,
  }: {
    userId: number;
    from?: string;
    to?: string;
  }): Promise<CombinedBalanceHistoryItem[]> => {
    try {
      // Get aggregated accounts balance history
      const accountsBalanceHistory = await getAggregatedBalanceHistory({ userId, from, to });

      if (!accountsBalanceHistory || accountsBalanceHistory.length === 0) {
        return [];
      }

      const uniqueDates = accountsBalanceHistory.map((item) => item.date);

      // Get user's portfolios
      const portfolios = await listPortfolios({ userId, isEnabled: true });

      if (portfolios.length === 0) {
        // If user has no portfolios, return only accounts balance with 0 portfolio balance
        return accountsBalanceHistory.map((item) => ({
          date: item.date,
          accountsBalance: item.amount,
          portfoliosBalance: 0,
          totalBalance: item.amount,
        }));
      }

      // Create date range for portfolio calculations
      const dateRange = uniqueDates.map((dateStr) => parseISO(dateStr));

      // Calculate historical portfolio values for all portfolios and all dates
      const portfolioValuesPromises = portfolios.map(async (portfolio) => {
        try {
          const values = await getPortfolioValuesForDateRange({
            userId,
            portfolioId: portfolio.id,
            dateRange,
          });
          return values;
        } catch (error) {
          console.warn(`Failed to get portfolio values for portfolio ${portfolio.id}:`, error);
          // Return zero values for this portfolio if calculation fails
          return dateRange.map((date) => ({
            date: format(date, 'yyyy-MM-dd'),
            totalValue: 0,
            totalCostBasis: 0,
            unrealizedGain: 0,
            currencyCode: 'USD',
          }));
        }
      });

      const allPortfolioValues = await Promise.all(portfolioValuesPromises);

      // Aggregate portfolio values by date
      const portfolioValuesByDate = new Map<string, number>();

      for (const portfolioValues of allPortfolioValues) {
        for (const value of portfolioValues) {
          const currentTotal = portfolioValuesByDate.get(value.date) || 0;
          portfolioValuesByDate.set(value.date, currentTotal + value.totalValue);
        }
      }

      // Create a map of accounts balance by date for easy lookup
      const accountsBalanceMap = new Map<string, number>();
      accountsBalanceHistory.forEach((item) => {
        accountsBalanceMap.set(item.date, item.amount);
      });

      // Combine accounts and portfolio balances
      const combinedHistory: CombinedBalanceHistoryItem[] = uniqueDates.map((dateStr) => {
        const accountsBalance = accountsBalanceMap.get(dateStr) || 0;
        const portfoliosBalance = toSystemAmount(portfolioValuesByDate.get(dateStr) || 0);

        return {
          date: dateStr,
          accountsBalance,
          portfoliosBalance,
          totalBalance: accountsBalance + portfoliosBalance,
        };
      });

      return combinedHistory;
    } catch (err) {
      console.error('Error getting combined balance history:', err);
      throw err;
    }
  },
);
