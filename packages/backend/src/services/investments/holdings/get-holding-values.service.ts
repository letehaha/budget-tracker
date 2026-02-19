import { INVESTMENT_DECIMAL_SCALE, Money } from '@common/types/money';
import Holdings from '@models/investments/Holdings.model';
import InvestmentTransaction from '@models/investments/InvestmentTransaction.model';
import Securities from '@models/investments/Securities.model';
import SecurityPricing from '@models/investments/SecurityPricing.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withDeduplication } from '@services/common/with-deduplication';
import { calculateAllGains } from '@services/investments/gains/gains-calculator.utils';
import { Op, WhereOptions } from 'sequelize';

interface GetHoldingValuesParams {
  portfolioId: number;
  date?: Date; // If not provided, uses latest available prices
  userId?: number; // For reference currency conversion
}

interface HoldingValue {
  portfolioId: number;
  securityId: number;
  quantity: string;
  costBasis: string;
  refCostBasis: string;
  currencyCode: string;
  excluded: boolean;
  security?: Securities;
  // Calculated fields
  latestPrice?: string;
  priceDate?: Date;
  marketValue?: string;
  refMarketValue?: string;
  // Gain/Loss fields
  unrealizedGainValue?: string;
  unrealizedGainPercent?: string;
  realizedGainValue?: string;
  realizedGainPercent?: string;
}

/**
 * Gets holdings with dynamically calculated market values based on prices.
 * This replaces the need to store stale value fields in the Holdings model.
 */
const getHoldingValuesImpl = async ({ portfolioId, date, userId }: GetHoldingValuesParams): Promise<HoldingValue[]> => {
  // Get all holdings for the portfolio
  const holdings = await Holdings.findAll({
    where: { portfolioId },
    include: [
      {
        model: Securities,
        as: 'security',
        required: true,
      },
    ],
  });

  if (holdings.length === 0) {
    return [];
  }

  const securityIds = holdings.map((h) => h.securityId);

  // Get all investment transactions for these securities in this portfolio
  const transactions = await InvestmentTransaction.findAll({
    where: {
      portfolioId,
      securityId: { [Op.in]: securityIds },
    },
    order: [['date', 'ASC']], // Chronological order for FIFO calculations
  });

  // Group transactions by securityId
  const transactionsBySecurityId = transactions.reduce(
    (acc, transaction) => {
      if (!acc[transaction.securityId]) {
        acc[transaction.securityId] = [];
      }
      acc[transaction.securityId]!.push(transaction);
      return acc;
    },
    {} as Record<number, InvestmentTransaction[]>,
  );

  // Build price query
  const priceWhere: WhereOptions = {
    securityId: { [Op.in]: securityIds },
  };

  if (date) {
    // Get prices for specific date (or closest before that date)
    priceWhere.date = { [Op.lte]: date };
  }

  // Get the relevant prices
  const prices = await SecurityPricing.findAll({
    where: priceWhere,
    order: [
      ['securityId', 'ASC'],
      ['date', 'DESC'], // Latest first
    ],
  });

  // Group prices by securityId (latest/closest first due to ordering)
  const pricesBySecurityId = prices.reduce(
    (acc, price) => {
      if (!acc[price.securityId]) {
        acc[price.securityId] = price;
      }
      return acc;
    },
    {} as Record<number, SecurityPricing>,
  );

  // Calculate market values for each holding
  const holdingValues: HoldingValue[] = [];

  for (const holding of holdings) {
    const price = pricesBySecurityId[holding.securityId];
    const quantity = holding.quantity.toBig();

    let marketValue = '0';
    let refMarketValue = '0';
    let latestPrice: string | undefined;
    let priceDate: Date | undefined;

    if (price) {
      latestPrice = price.priceClose.toDecimalString(INVESTMENT_DECIMAL_SCALE);
      priceDate = price.date;
      const priceClose = price.priceClose.toBig();
      marketValue = quantity.times(priceClose).toFixed(10);

      // Calculate reference market value if userId provided
      if (userId && parseFloat(marketValue) > 0) {
        try {
          const refAmount = await calculateRefAmount({
            amount: Money.fromDecimal(marketValue),
            baseCode: holding.currencyCode,
            userId,
            date: date || new Date(),
          });
          refMarketValue = refAmount.toDecimalString(INVESTMENT_DECIMAL_SCALE);
        } catch (error) {
          // If reference conversion fails, keep as 0
          refMarketValue = '0';
        }
      }
    }

    // Calculate gains/losses
    const securityTransactions = transactionsBySecurityId[holding.securityId] || [];
    const gains = calculateAllGains(
      parseFloat(marketValue),
      holding.costBasis.toNumber(),
      securityTransactions.map((tx) => ({
        date: tx.date,
        category: tx.category,
        quantity: tx.quantity.toDecimalString(INVESTMENT_DECIMAL_SCALE),
        price: tx.price.toDecimalString(INVESTMENT_DECIMAL_SCALE),
        fees: tx.fees.toDecimalString(INVESTMENT_DECIMAL_SCALE),
      })),
    );

    holdingValues.push({
      portfolioId: holding.portfolioId,
      securityId: holding.securityId,
      quantity: holding.quantity.toDecimalString(INVESTMENT_DECIMAL_SCALE),
      costBasis: holding.costBasis.toDecimalString(INVESTMENT_DECIMAL_SCALE),
      refCostBasis: holding.refCostBasis.toDecimalString(INVESTMENT_DECIMAL_SCALE),
      currencyCode: holding.currencyCode,
      excluded: holding.excluded,
      security: holding.security,
      latestPrice,
      priceDate,
      marketValue,
      refMarketValue,
      unrealizedGainValue: gains.unrealizedGainValue.toFixed(2),
      unrealizedGainPercent: gains.unrealizedGainPercent.toFixed(2),
      realizedGainValue: gains.realizedGainValue.toFixed(2),
      realizedGainPercent: gains.realizedGainPercent.toFixed(2),
    });
  }

  return holdingValues;
};

// Do not call `withTransaction` here because it's fundamentally not compatible
// with `withDeduplication`. Also on 99.99% `withTransaction` will already be
// defined on the level above, since this service is not really callable alone
// It also doesn't really update anything in the DB, so even if it will be called without
// `withTransaction` and something fails, we don't really need to undo anything, since there's nothing to undo

export const getHoldingValues = withDeduplication(getHoldingValuesImpl, {
  keyGenerator: ({ portfolioId, date, userId }) =>
    `holdings-${portfolioId}-${userId || 'no-user'}-${date?.toISOString() || 'latest'}`,
  ttl: 1000, // 1 second cache to handle concurrent requests, yet not that much to be stale
  maxCacheSize: 5, // Reasonable limit for portfolio operations. It's not expected to have huge amount of calls
});
