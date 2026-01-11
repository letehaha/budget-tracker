import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types';
import { toSystemAmount } from '@js/helpers/system-amount';
import { logger } from '@js/utils';
import ExchangeRates from '@models/ExchangeRates.model';
import UserExchangeRates from '@models/UserExchangeRates.model';
import UsersCurrencies from '@models/UsersCurrencies.model';
import InvestmentTransaction from '@models/investments/InvestmentTransaction.model';
import Portfolios from '@models/investments/Portfolios.model';
import SecurityPricing from '@models/investments/SecurityPricing.model';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import { Op } from 'sequelize';

import { getAggregatedBalanceHistory } from './get-balance-history';

export interface CombinedBalanceHistoryItem {
  date: string;
  accountsBalance: number;
  portfoliosBalance: number;
  totalBalance: number;
}

/**
 * Helper function to calculate portfolio balance history
 * Runs independently of accounts balance calculation
 */
const calculatePortfolioBalanceHistory = async ({
  userId,
  minDate,
  maxDate,
  uniqueDates,
}: {
  userId: number;
  minDate: string;
  maxDate: string;
  uniqueDates: string[];
}): Promise<Map<string, number> | null> => {
  const [userBaseCurrency, portfolios] = await Promise.all([
    UsersCurrencies.findOne({
      where: { userId, isDefaultCurrency: true },
      raw: true,
      attributes: ['currencyCode'],
    }) as Promise<Pick<UsersCurrencies, 'currencyCode'> | null>,
    Portfolios.findAll({
      where: { userId, isEnabled: true },
      attributes: ['id'],
      raw: true,
    }),
  ]);

  if (!userBaseCurrency?.currencyCode || portfolios.length === 0) {
    return null;
  }

  const portfolioIds = portfolios.map((p: { id: number }) => p.id);

  type TransactionRow = Pick<
    InvestmentTransaction,
    'portfolioId' | 'securityId' | 'category' | 'date' | 'quantity' | 'refAmount' | 'refFees' | 'currencyCode'
  >;

  type HoldingState = {
    quantity: number;
    costBasis: number;
    currencyCode: string;
  };

  const transactions: TransactionRow[] = await InvestmentTransaction.findAll({
    where: {
      portfolioId: { [Op.in]: portfolioIds },
      date: {
        [Op.lte]: maxDate,
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

  const securityIds = [...new Set(transactions.map((t: TransactionRow) => t.securityId))];
  const currencyCodes = [...new Set(transactions.map((t: TransactionRow) => t.currencyCode))];

  if (securityIds.length === 0) {
    return null;
  }

  type SecurityPriceRow = Pick<SecurityPricing, 'securityId' | 'date' | 'priceClose'>;
  type ExchangeRateRow = Pick<UserExchangeRates, 'baseCode' | 'quoteCode' | 'date' | 'rate'>;

  const [securityPrices, userCustomExchangeRates, systemExchangeRates] = await Promise.all([
    SecurityPricing.findAll({
      where: {
        securityId: {
          [Op.in]: securityIds,
        },
        date: {
          [Op.between]: [minDate, maxDate],
        },
      },
      order: [
        ['securityId', 'ASC'],
        ['date', 'ASC'],
      ],
      attributes: ['securityId', 'date', 'priceClose'],
      raw: true,
    }) as Promise<SecurityPriceRow[]>,
    UserExchangeRates.findAll({
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
    }) as Promise<ExchangeRateRow[]>,
    ExchangeRates.findAll({
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
    }),
  ]);

  const formatDate = (date: Date | string): string => format(date, 'yyyy-MM-dd');

  // Build price lookup with O(1) access by security+date
  const pricesBySecurity = new Map<number, Array<{ date: string; price: number }>>();
  const pricesBySecurityAndDate = new Map<string, number>(); // "securityId_date" -> price
  for (const price of securityPrices) {
    const dateStr = String(price.date);
    const priceValue = parseFloat(price.priceClose);

    if (!pricesBySecurity.has(price.securityId)) {
      pricesBySecurity.set(price.securityId, []);
    }
    pricesBySecurity.get(price.securityId)!.push({
      date: dateStr,
      price: priceValue,
    });
    pricesBySecurityAndDate.set(`${price.securityId}_${dateStr}`, priceValue);
  }

  const exchangeRateMap = new Map<string, number>();

  // Build user rates map first for O(1) lookup
  const userRatesMap = new Map<string, number>();
  for (const r of userCustomExchangeRates) {
    userRatesMap.set(`${r.baseCode}_${formatDate(r.date)}`, r.rate);
  }

  for (const rate of systemExchangeRates) {
    const key = `${rate.baseCode}_${formatDate(rate.date)}`;
    // O(1) lookup instead of O(n) find
    const userRate = userRatesMap.get(key);
    exchangeRateMap.set(key, userRate ?? rate.rate);
  }

  const getExchangeRate = (currencyCode: string, dateStr: string): number => {
    if (currencyCode === userBaseCurrency.currencyCode) {
      return 1;
    }

    const key = `${currencyCode}_${dateStr}`;
    const rate = exchangeRateMap.get(key);

    if (rate) {
      return rate;
    }

    const availableRates = Array.from(exchangeRateMap.entries())
      .filter(([k]) => {
        const parts = k.split('_');
        return k.startsWith(`${currencyCode}_`) && parts[1] && parts[1] <= dateStr;
      })
      .sort((a, b) => b[0].localeCompare(a[0]));

    if (availableRates.length > 0) {
      return availableRates[0]![1];
    }

    logger.warn(`No exchange rate found for ${currencyCode} on ${dateStr}, using 1:1`);
    return 1;
  };

  const findPriceForDate = (securityId: number, targetDate: string): number | null => {
    // O(1) exact match lookup
    const exactPrice = pricesBySecurityAndDate.get(`${securityId}_${targetDate}`);
    if (exactPrice !== undefined) return exactPrice;

    // Fallback: find latest price before target date
    const prices = pricesBySecurity.get(securityId);
    if (!prices || prices.length === 0) return null;

    // Find the last price that's <= targetDate (prices are sorted ASC)
    let lastValidPrice: number | null = null;
    for (const p of prices) {
      if (p.date <= targetDate) {
        lastValidPrice = p.price;
      } else {
        break; // prices are sorted, no need to continue
      }
    }
    return lastValidPrice;
  };

  // Pre-group transactions by portfolio for O(1) lookup instead of O(n) filter
  const transactionsByPortfolio = new Map<number, TransactionRow[]>();
  for (const tx of transactions) {
    if (!transactionsByPortfolio.has(tx.portfolioId)) {
      transactionsByPortfolio.set(tx.portfolioId, []);
    }
    transactionsByPortfolio.get(tx.portfolioId)!.push(tx);
  }

  const portfolioValuesByDate = new Map<string, number>();

  // Process all portfolios, building up holdings state incrementally by date
  // Each portfolio's transactions are already sorted by date ASC
  for (const dateStr of uniqueDates) {
    let totalValueForDate = 0;

    for (const portfolioId of portfolioIds) {
      const portfolioTxs = transactionsByPortfolio.get(portfolioId) ?? [];

      // Build holdings by processing transactions up to this date
      // Transactions are already ordered by date ASC, so we can process incrementally
      const holdings = new Map<number, HoldingState>();

      for (const tx of portfolioTxs) {
        // Since transactions are sorted by date, once we pass the current date, stop
        if (tx.date > dateStr) break;

        const securityId = tx.securityId;
        const quantity = parseFloat(tx.quantity);
        const totalAmount = parseFloat(tx.refAmount) + parseFloat(tx.refFees);

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

      for (const [securityId, holding] of holdings) {
        const currentPrice = findPriceForDate(securityId, dateStr);

        if (currentPrice) {
          const marketValueInSecurityCurrency = holding.quantity * currentPrice;
          const exchangeRate = getExchangeRate(holding.currencyCode, dateStr);
          const marketValueInBaseCurrency = Math.floor(marketValueInSecurityCurrency * exchangeRate);
          totalValueForDate += marketValueInBaseCurrency;
        } else {
          totalValueForDate += holding.costBasis;
        }
      }
    }

    portfolioValuesByDate.set(dateStr, toSystemAmount(totalValueForDate));
  }

  return portfolioValuesByDate;
};

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
export const getCombinedBalanceHistory = async ({
  userId,
  from,
  to,
}: {
  userId: number;
  from?: string;
  to?: string;
}): Promise<CombinedBalanceHistoryItem[]> => {
  try {
    // Handle optional from/to parameters
    // If 'to' is not provided, use today
    const maxDate = to || format(new Date(), 'yyyy-MM-dd');

    // If 'from' is not provided, try to get the earliest investment transaction date
    let minDate = from;
    if (!minDate) {
      const oldestTransaction = await InvestmentTransaction.findOne({
        include: [
          {
            model: Portfolios,
            // Filter out transactions for userId
            where: { userId, isEnabled: true },
            attributes: [],
          },
        ],
        order: [['date', 'ASC']],
        attributes: ['date'],
        raw: true,
      });

      minDate = oldestTransaction?.date ? format(new Date(oldestTransaction.date), 'yyyy-MM-dd') : maxDate; // Fallback to maxDate if no transactions
    }

    const uniqueDates = eachDayOfInterval({
      start: parseISO(minDate),
      end: parseISO(maxDate),
    }).map((date) => format(date, 'yyyy-MM-dd'));

    const [accountsBalanceHistory, portfolioValuesByDate] = await Promise.all([
      getAggregatedBalanceHistory({ userId, from: minDate, to: maxDate }),
      calculatePortfolioBalanceHistory({ userId, minDate, maxDate, uniqueDates }),
    ]);

    // If no data at all, return empty array
    if (
      (!accountsBalanceHistory || accountsBalanceHistory.length === 0) &&
      (!portfolioValuesByDate || portfolioValuesByDate.size === 0)
    ) {
      return [];
    }

    // Build Map for O(1) lookup instead of O(n) find
    const accountsBalanceByDate = new Map<string, number>();
    for (const item of accountsBalanceHistory) {
      accountsBalanceByDate.set(item.date, item.amount);
    }

    // Combine accounts and portfolio balances with O(1) lookups
    const combinedHistory: CombinedBalanceHistoryItem[] = uniqueDates.map((dateStr) => {
      const accountsBalance = accountsBalanceByDate.get(dateStr) ?? 0;
      const portfoliosBalance = portfolioValuesByDate?.get(dateStr) ?? 0;

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
