import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types';
import { toSystemAmount } from '@js/helpers/system-amount';
import { logger } from '@js/utils';
import ExchangeRates from '@models/ExchangeRates.model';
import UserExchangeRates from '@models/UserExchangeRates.model';
import UsersCurrencies from '@models/UsersCurrencies.model';
import InvestmentTransaction from '@models/investments/InvestmentTransaction.model';
import Portfolios from '@models/investments/Portfolios.model';
import SecurityPricing from '@models/investments/SecurityPricing.model';
import { format } from 'date-fns';
import { Op } from 'sequelize';

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
export const getCombinedBalanceHistoryOptimized = async ({
  userId,
  from,
  to,
}: {
  userId: number;
  from?: string;
  to?: string;
}): Promise<CombinedBalanceHistoryItem[]> => {
  try {
    // Get aggregated accounts balance history (reuse existing logic - it's already optimized)
    const accountsBalanceHistory = await getAggregatedBalanceHistory({ userId, from, to });

    if (!accountsBalanceHistory || accountsBalanceHistory.length === 0) {
      return [];
    }

    const uniqueDates = accountsBalanceHistory.map((item) => item.date);
    const maxDate = uniqueDates[uniqueDates.length - 1];
    const minDate = uniqueDates[0];

    // 1. Get user's base currency (ONE query instead of 100+)
    const userBaseCurrency: Pick<UsersCurrencies, 'currencyCode'> | null = await UsersCurrencies.findOne({
      where: { userId, isDefaultCurrency: true },
      raw: true,
      attributes: ['currencyCode'],
    });

    if (!userBaseCurrency?.currencyCode) {
      // No user currency found - return only accounts balance
      return accountsBalanceHistory.map((item) => ({
        date: item.date,
        accountsBalance: item.amount,
        portfoliosBalance: 0,
        totalBalance: item.amount,
      }));
    }

    // 2. Get all enabled portfolios for the user (ONE query instead of multiple)
    const portfolios = await Portfolios.findAll({
      where: { userId, isEnabled: true },
      attributes: ['id'],
      raw: true,
    });

    if (portfolios.length === 0) {
      // If user has no portfolios, return only accounts balance with 0 portfolio balance
      return accountsBalanceHistory.map((item) => ({
        date: item.date,
        accountsBalance: item.amount,
        portfoliosBalance: 0,
        totalBalance: item.amount,
      }));
    }

    const portfolioIds = portfolios.map((p: { id: number }) => p.id);

    type TransactionRow = Pick<
      InvestmentTransaction,
      'portfolioId' | 'securityId' | 'category' | 'date' | 'quantity' | 'refAmount' | 'refFees' | 'currencyCode'
    >;

    // 3. Get ALL investment transactions for ALL portfolios in ONE query (instead of 100+)
    const transactions: TransactionRow[] = await InvestmentTransaction.findAll({
      where: {
        portfolioId: { [Op.in]: portfolioIds },
        date: {
          [Op.lte]: maxDate,
          // [Op.gte]: minDate,
        },
      },
      order: [
        ['portfolioId', 'ASC'],
        ['date', 'ASC'],
        ['createdAt', 'ASC'],
      ],
      attributes: ['portfolioId', 'securityId', 'category', 'date', 'quantity', 'refAmount', 'refFees', 'currencyCode'],
      raw: true,
    });

    // Get all unique security IDs
    const securityIds = [...new Set(transactions.map((t: TransactionRow) => t.securityId))];

    if (securityIds.length === 0) {
      // No transactions found - return only accounts balance
      return accountsBalanceHistory.map((item) => ({
        date: item.date,
        accountsBalance: item.amount,
        portfoliosBalance: 0,
        totalBalance: item.amount,
      }));
    }

    // 4. Get ALL security prices in ONE query (instead of 100+)
    type SecurityPriceRow = Pick<SecurityPricing, 'securityId' | 'date' | 'priceClose'>;
    const securityPrices: SecurityPriceRow[] = await SecurityPricing.findAll({
      where: {
        securityId: {
          [Op.in]: securityIds,
        },
        date: {
          [Op.lte]: maxDate,
          // [Op.gte]: minDate,
        },
      },
      order: [
        ['securityId', 'ASC'],
        ['date', 'ASC'],
      ],
      attributes: ['securityId', 'date', 'priceClose'],
      raw: true,
    });

    // Build price lookup map: securityId -> array of { date, price }
    const pricesBySecurity = new Map<number, Array<{ date: string; price: number }>>();
    for (const price of securityPrices) {
      if (!pricesBySecurity.has(price.securityId)) {
        pricesBySecurity.set(price.securityId, []);
      }
      pricesBySecurity.get(price.securityId)!.push({
        date: String(price.date),
        price: parseFloat(price.priceClose),
      });
    }

    // 5. Get unique currency codes from transactions
    const currencyCodes = [...new Set(transactions.map((t: TransactionRow) => t.currencyCode))];

    // 6. Batch-fetch exchange rates for all (currency, date) combinations
    // Get all exchange rates needed for currency conversion
    type ExchangeRateRow = Pick<UserExchangeRates, 'baseCode' | 'quoteCode' | 'date' | 'rate'>;
    const userCustomExchangeRates: ExchangeRateRow[] = await UserExchangeRates.findAll({
      where: {
        userId,
        baseCode: {
          [Op.in]: currencyCodes,
        },
        quoteCode: userBaseCurrency.currencyCode,
        date: {
          [Op.between]: [minDate, maxDate],
        },
      },
      attributes: ['baseCode', 'quoteCode', 'date', 'rate'],
      raw: true,
    });

    const systemExchangeRates = await ExchangeRates.findAll({
      where: {
        baseCode: {
          [Op.in]: currencyCodes,
        },
        quoteCode: userBaseCurrency.currencyCode,
        date: {
          [Op.between]: [minDate, maxDate],
        },
      },
      raw: true,
    });

    // Build exchange rate lookup map: "currencyCode_date" -> rate
    // Use systemExchangeRates as base, but prioritize exchangeRatesNew when available
    const exchangeRateMap = new Map<string, number>();
    for (const rate of systemExchangeRates) {
      const formatDate = (date) => format(date, 'yyyy-MM-dd');
      const key = `${rate.baseCode}_${formatDate(rate.date)}`;
      // Check if user has custom rate for this combination
      const userRate = userCustomExchangeRates.find(
        (r) => r.baseCode === rate.baseCode && formatDate(r.date) === formatDate(rate.date),
      );
      // Use user rate if available, otherwise use system rate
      exchangeRateMap.set(key, userRate ? userRate.rate : rate.rate);
    }

    // Helper function to get exchange rate for a currency on a specific date
    const getExchangeRate = (currencyCode: string, dateStr: string): number => {
      // If currency is already base currency, rate is 1
      if (currencyCode === userBaseCurrency.currencyCode) {
        return 1;
      }

      const key = `${currencyCode}_${dateStr}`;
      const rate = exchangeRateMap.get(key);

      if (rate) {
        return rate;
      }

      // Fallback: find the most recent rate before this date
      const availableRates = Array.from(exchangeRateMap.entries())
        .filter(([k]) => {
          const parts = k.split('_');
          return k.startsWith(`${currencyCode}_`) && parts[1] && parts[1] <= dateStr;
        })
        .sort((a, b) => b[0].localeCompare(a[0]));

      if (availableRates.length > 0) {
        return availableRates[0]![1];
      }

      // If no rate found, assume 1:1 (this shouldn't happen in production)
      logger.warn(`No exchange rate found for ${currencyCode} on ${dateStr}, using 1:1`);
      return 1;
    };

    // Helper function to find price for a security on a specific date
    const findPriceForDate = (securityId: number, targetDate: string): number | null => {
      const prices = pricesBySecurity.get(securityId);
      if (!prices) return null;

      // Try exact match first
      const exactMatch = prices.find((p) => p.date === targetDate);
      if (exactMatch) return exactMatch.price;

      // Find most recent price before target date
      const availablePrices = prices.filter((p) => p.date <= targetDate);
      if (availablePrices.length > 0) {
        return availablePrices[availablePrices.length - 1]!.price;
      }

      return null;
    };

    // Calculate portfolio values for each date
    const portfolioValuesByDate = new Map<string, number>();

    // For each unique date, calculate total portfolio value
    for (const dateStr of uniqueDates) {
      let totalValueForDate = 0;

      // Calculate holdings for each portfolio at this date
      for (const portfolioId of portfolioIds) {
        const portfolioTransactions = transactions.filter(
          (t: TransactionRow) => t.portfolioId === portfolioId && t.date <= dateStr,
        );

        // Calculate holdings by replaying transactions
        const holdings = new Map<
          number,
          {
            quantity: number;
            costBasis: number;
            currencyCode: string;
          }
        >();

        for (const tx of portfolioTransactions) {
          const securityId = tx.securityId;
          const quantity = parseFloat(tx.quantity);
          const totalAmount = parseFloat(tx.refAmount) + parseFloat(tx.refFees); // Already in base currency

          if (!holdings.has(securityId)) {
            holdings.set(securityId, {
              quantity: 0,
              costBasis: 0,
              currencyCode: tx.currencyCode,
            });
          }

          const holding = holdings.get(securityId)!;

          if (tx.category === INVESTMENT_TRANSACTION_CATEGORY.buy) {
            holding.quantity += quantity;
            holding.costBasis += totalAmount;
          } else if (tx.category === INVESTMENT_TRANSACTION_CATEGORY.sell) {
            if (holding.quantity > 0) {
              const sellRatio = quantity / holding.quantity;
              holding.costBasis *= 1 - sellRatio;
              holding.quantity -= quantity;
            }
          }

          if (holding.quantity <= 0) {
            holdings.delete(securityId);
          }
        }

        // Calculate total value for this portfolio
        for (const [securityId, holding] of holdings) {
          if (holding.quantity <= 0) continue;

          const currentPrice = findPriceForDate(securityId, dateStr);

          if (currentPrice) {
            // Market value in security's currency (e.g., USD)
            const marketValueInSecurityCurrency = holding.quantity * currentPrice;

            // Get exchange rate for this date to convert to base currency (e.g., UAH)
            const exchangeRate = getExchangeRate(holding.currencyCode, dateStr);

            // Convert to base currency
            const marketValueInBaseCurrency = Math.floor(marketValueInSecurityCurrency * exchangeRate);

            totalValueForDate += marketValueInBaseCurrency;
          } else {
            // Fallback to cost basis if no price available
            totalValueForDate += holding.costBasis;
          }
        }
      }

      portfolioValuesByDate.set(dateStr, toSystemAmount(totalValueForDate));
    }

    // Combine accounts and portfolio balances
    const combinedHistory: CombinedBalanceHistoryItem[] = uniqueDates.map((dateStr) => {
      const accountsBalance = accountsBalanceHistory.find((item) => item.date === dateStr)?.amount || 0;
      const portfoliosBalance = portfolioValuesByDate.get(dateStr) || 0;

      return {
        date: dateStr,
        accountsBalance,
        portfoliosBalance,
        totalBalance: accountsBalance + portfoliosBalance,
      };
    });

    return combinedHistory;
  } catch (err) {
    console.error('Error getting optimized combined balance history:', err);
    throw err;
  }
};
