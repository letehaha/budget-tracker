import Holdings from '@models/investments/Holdings.model';
import Securities from '@models/investments/Securities.model';
import SecurityPricing from '@models/investments/SecurityPricing.model';
import { withTransaction } from '@services/common';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { Big } from 'big.js';
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

  const securityIds = holdings.map(h => h.securityId);

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
  const pricesBySecurityId = prices.reduce((acc, price) => {
    if (!acc[price.securityId]) {
      acc[price.securityId] = price;
    }
    return acc;
  }, {} as Record<number, SecurityPricing>);

  // Calculate market values for each holding
  const holdingValues: HoldingValue[] = [];

  for (const holding of holdings) {
    const price = pricesBySecurityId[holding.securityId];
    const quantity = new Big(holding.quantity);
    
    let marketValue = '0';
    let refMarketValue = '0';
    let latestPrice: string | undefined;
    let priceDate: Date | undefined;

    if (price) {
      latestPrice = price.priceClose;
      priceDate = price.date;
      const priceClose = new Big(price.priceClose);
      marketValue = quantity.times(priceClose).toFixed(10);

      // Calculate reference market value if userId provided
      if (userId && parseFloat(marketValue) > 0) {
        try {
          const refAmount = await calculateRefAmount({
            amount: parseFloat(marketValue),
            baseCode: holding.currencyCode,
            userId,
            date: date || new Date(),
          });
          refMarketValue = refAmount.toString();
        } catch (error) {
          // If reference conversion fails, keep as 0
          refMarketValue = '0';
        }
      }
    }

    holdingValues.push({
      portfolioId: holding.portfolioId,
      securityId: holding.securityId,
      quantity: holding.quantity,
      costBasis: holding.costBasis,
      refCostBasis: holding.refCostBasis,
      currencyCode: holding.currencyCode,
      excluded: holding.excluded,
      security: holding.security,
      latestPrice,
      priceDate,
      marketValue,
      refMarketValue,
    });
  }

  return holdingValues;
};

export const getHoldingValues = withTransaction(getHoldingValuesImpl);