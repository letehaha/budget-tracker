import { asCents } from '@bt/shared/types';
import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import * as UsersCurrencies from '@models/UsersCurrencies.model';
import InvestmentTransaction from '@models/investments/InvestmentTransaction.model';
import Portfolios from '@models/investments/Portfolios.model';
import Securities from '@models/investments/Securities.model';
import SecurityPricing from '@models/investments/SecurityPricing.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common/with-transaction';
import { format } from 'date-fns';
import { Op } from 'sequelize';

interface HistoricalHolding {
  securityId: number;
  quantity: number;
  costBasis: number;
  currencyCode: string;
}

interface PortfolioValueAtDate {
  date: string;
  totalValue: number;
  totalCostBasis: number;
  unrealizedGain: number;
  currencyCode: string;
}

interface GetHistoricalPortfolioValueParams {
  userId: number;
  portfolioId: number;
  date: Date;
}

interface GetHistoricalPortfolioValuesParams {
  userId: number;
  portfolioId: number;
  dateRange: Date[];
}

// Cache configuration - 1 month TTL
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const portfolioValueCache = new Map<string, { value: PortfolioValueAtDate; timestamp: number }>();

/**
 * Calculate portfolio holdings for a specific date by replaying all transactions up to that date
 */
const calculateHoldingsAtDate = async (portfolioId: number, targetDate: Date): Promise<HistoricalHolding[]> => {
  // Get all transactions up to the target date
  const transactions = await InvestmentTransaction.findAll({
    where: {
      portfolioId,
      date: {
        [Op.lte]: format(targetDate, 'yyyy-MM-dd'),
      },
    },
    include: [
      {
        model: Securities,
        attributes: ['id', 'symbol', 'name'],
      },
    ],
    order: [
      ['date', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  });

  // Replay transactions to calculate holdings
  const holdings = new Map<number, HistoricalHolding>();

  for (const tx of transactions) {
    const securityId = tx.securityId;
    const quantity = parseFloat(tx.quantity);
    const totalAmount = parseFloat(tx.refAmount) + parseFloat(tx.refFees);

    if (!holdings.has(securityId)) {
      holdings.set(securityId, {
        securityId,
        quantity: 0,
        costBasis: 0,
        currencyCode: tx.currencyCode,
      });
    }

    const holding = holdings.get(securityId)!;

    if (tx.category === INVESTMENT_TRANSACTION_CATEGORY.buy) {
      // Buy: Add quantity and increase cost basis
      holding.quantity += quantity;
      holding.costBasis += totalAmount;
    } else if (tx.category === INVESTMENT_TRANSACTION_CATEGORY.sell) {
      // Sell: Reduce quantity and proportionally reduce cost basis
      if (holding.quantity > 0) {
        const sellRatio = quantity / holding.quantity;
        holding.costBasis *= 1 - sellRatio;
        holding.quantity -= quantity;
      }
    }

    // Remove holdings with zero or negative quantity
    if (holding.quantity <= 0) {
      holdings.delete(securityId);
    }
  }

  return Array.from(holdings.values()).filter((h) => h.quantity > 0);
};

/**
 * Get security prices for multiple securities and dates efficiently
 * If a price isn't available for a specific date, carry forward the last known price
 */
const getSecurityPricesForDates = async (securityIds: number[], dates: Date[]): Promise<Map<string, number>> => {
  if (securityIds.length === 0) return new Map();

  // Get all available prices for these securities up to the latest requested date
  const maxDate = Math.max(...dates.map((d) => d.getTime()));

  const prices = await SecurityPricing.findAll({
    where: {
      securityId: {
        [Op.in]: securityIds,
      },
      date: {
        [Op.lte]: format(new Date(maxDate), 'yyyy-MM-dd'),
      },
    },
    attributes: ['securityId', 'date', 'priceClose'],
    order: [
      ['securityId', 'ASC'],
      ['date', 'ASC'],
    ],
  });

  const priceMap = new Map<string, number>();

  // Group prices by security for easier processing
  const pricesBySecurityId = new Map<number, Array<{ date: string; price: number }>>();

  for (const price of prices) {
    const securityId = price.securityId;
    if (!pricesBySecurityId.has(securityId)) {
      pricesBySecurityId.set(securityId, []);
    }
    pricesBySecurityId.get(securityId)!.push({
      date: String(price.date),
      price: parseFloat(price.priceClose),
    });
  }

  // For each security and requested date, find the most recent available price
  for (const securityId of securityIds) {
    const securityPrices = pricesBySecurityId.get(securityId) || [];

    for (const date of dates) {
      const dateStr = format(date, 'yyyy-MM-dd');
      const key = `${securityId}_${dateStr}`;

      // Try to find exact date match first
      const exactMatch = securityPrices.find((p) => p.date === dateStr);
      if (exactMatch) {
        priceMap.set(key, exactMatch.price);
        continue;
      }

      // If no exact match, find the most recent price before this date
      const availablePrices = securityPrices.filter((p) => p.date <= dateStr);
      if (availablePrices.length > 0) {
        const latestPrice = availablePrices[availablePrices.length - 1]!;
        priceMap.set(key, latestPrice.price);
      }
    }
  }

  return priceMap;
};

/**
 * Calculate portfolio value for a specific date
 */
const calculatePortfolioValueAtDateImpl = async ({
  userId,
  portfolioId,
  date,
}: GetHistoricalPortfolioValueParams): Promise<PortfolioValueAtDate> => {
  // Verify portfolio exists and belongs to user
  const portfolio = await Portfolios.findOne({
    where: { id: portfolioId, userId },
  });

  if (!portfolio) {
    throw new NotFoundError({ message: t({ key: 'investments.portfolioNotFound' }) });
  }

  // Get user's base currency
  const userCurrency = await UsersCurrencies.getCurrency({
    userId,
    isDefaultCurrency: true,
  });

  if (!userCurrency) {
    throw new NotFoundError({ message: t({ key: 'investments.userBaseCurrencyNotFound' }) });
  }

  const baseCurrencyCode = userCurrency.currency.code;
  const dateStr = format(date, 'yyyy-MM-dd');

  // Calculate holdings at the target date
  const holdings = await calculateHoldingsAtDate(portfolioId, date);

  if (holdings.length === 0) {
    return {
      date: dateStr,
      totalValue: 0,
      totalCostBasis: 0,
      unrealizedGain: 0,
      currencyCode: baseCurrencyCode,
    };
  }

  // Get security prices for the date
  const securityIds = holdings.map((h) => h.securityId);
  const priceMap = await getSecurityPricesForDates(securityIds, [date]);

  let totalValue = 0;
  let totalCostBasis = 0;

  // Calculate total value and cost basis
  for (const holding of holdings) {
    const priceKey = `${holding.securityId}_${dateStr}`;
    const price = priceMap.get(priceKey);

    // Cost basis is always included regardless of price availability
    totalCostBasis += holding.costBasis;

    if (price) {
      // Market value in security's currency
      const marketValueInSecurityCurrency = holding.quantity * price;

      // Convert to base currency
      const marketValueInBase = await calculateRefAmount({
        amount: asCents(marketValueInSecurityCurrency),
        userId,
        date,
        baseCode: holding.currencyCode,
        quoteCode: baseCurrencyCode,
      });

      totalValue += marketValueInBase;
    } else {
      // If no price available even after carry-forward logic, use cost basis as fallback
      // This should only happen for very new securities or data issues
      totalValue += holding.costBasis;
    }
  }

  return {
    date: dateStr,
    totalValue,
    totalCostBasis,
    unrealizedGain: totalValue - totalCostBasis,
    currencyCode: baseCurrencyCode,
  };
};

/**
 * Get cached portfolio value or calculate if not cached
 */
const getPortfolioValueAtDateWithCache = async (
  params: GetHistoricalPortfolioValueParams,
): Promise<PortfolioValueAtDate> => {
  const cacheKey = `portfolio_${params.portfolioId}_${format(params.date, 'yyyy-MM-dd')}`;
  const cached = portfolioValueCache.get(cacheKey);

  // Check if cached value exists and is not expired
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  // Calculate value
  const value = await calculatePortfolioValueAtDateImpl(params);

  // Cache the result
  portfolioValueCache.set(cacheKey, {
    value,
    timestamp: Date.now(),
  });

  return value;
};

/**
 * Efficiently calculate portfolio values for multiple dates with batch processing
 */
const calculatePortfolioValuesForDateRangeImpl = async ({
  userId,
  portfolioId,
  dateRange,
}: GetHistoricalPortfolioValuesParams): Promise<PortfolioValueAtDate[]> => {
  // Check cache first for all dates
  const results: PortfolioValueAtDate[] = [];
  const datesToCalculate: Date[] = [];

  for (const date of dateRange) {
    const cacheKey = `portfolio_${portfolioId}_${format(date, 'yyyy-MM-dd')}`;
    const cached = portfolioValueCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      results.push(cached.value);
    } else {
      datesToCalculate.push(date);
    }
  }

  // Calculate missing dates
  if (datesToCalculate.length > 0) {
    const calculatedValues = await Promise.all(
      datesToCalculate.map((date) => getPortfolioValueAtDateWithCache({ userId, portfolioId, date })),
    );
    results.push(...calculatedValues);
  }

  // Sort results by date
  return results.sort((a, b) => a.date.localeCompare(b.date));
};

/**
 * Clean expired cache entries
 */
const cleanExpiredCache = () => {
  const now = Date.now();
  for (const [key, entry] of portfolioValueCache.entries()) {
    if (now - entry.timestamp >= CACHE_TTL_MS) {
      portfolioValueCache.delete(key);
    }
  }
};

// Clean cache every hour
setInterval(cleanExpiredCache, 60 * 60 * 1000);

export const getPortfolioValueAtDate = withTransaction(getPortfolioValueAtDateWithCache);
export const getPortfolioValuesForDateRange = withTransaction(calculatePortfolioValuesForDateRangeImpl);

// Export for testing
export { calculateHoldingsAtDate, cleanExpiredCache };
