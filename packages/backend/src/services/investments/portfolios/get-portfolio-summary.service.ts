import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import * as UsersCurrencies from '@models/UsersCurrencies.model';
import Portfolios from '@models/investments/Portfolios.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common/with-transaction';
import { getHoldingValues } from '@services/investments/holdings/get-holding-values.service';

interface GetPortfolioSummaryParams {
  userId: number;
  portfolioId: number;
  date?: Date;
}

export interface PortfolioSummaryResult {
  portfolioId: number;
  portfolioName: string;
  totalCurrentValue: string;
  totalCostBasis: string;
  unrealizedGainValue: string;
  unrealizedGainPercent: string;
  realizedGainValue: string;
  realizedGainPercent: string;
  currencyCode: string; // User's base currency
}

const getPortfolioSummaryImpl = async ({
  userId,
  portfolioId,
  date,
}: GetPortfolioSummaryParams): Promise<PortfolioSummaryResult> => {
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

  // Get all holdings with their gain/loss calculations
  const holdings = await getHoldingValues({ portfolioId, date, userId });

  if (holdings.length === 0) {
    // Return zero values if no holdings
    return {
      portfolioId,
      portfolioName: portfolio.name,
      totalCurrentValue: '0.00',
      totalCostBasis: '0.00',
      unrealizedGainValue: '0.00',
      unrealizedGainPercent: '0.00',
      realizedGainValue: '0.00',
      realizedGainPercent: '0.00',
      currencyCode: baseCurrencyCode,
    };
  }

  // Aggregate values using reference currency amounts (already converted)
  let totalCurrentValueInBase = 0;
  let totalCostBasisInBase = 0;
  let totalUnrealizedGainInBase = 0;
  let totalRealizedGainInBase = 0;

  const conversionDate = date || new Date();

  for (const holding of holdings) {
    // Use reference currency values (already converted to user's base currency)
    const marketValueInBase = parseFloat(holding.refMarketValue || '0');
    const costBasisInBase = parseFloat(holding.refCostBasis || '0');

    // Calculate unrealized gain in reference currency
    const unrealizedGainInBase = marketValueInBase - costBasisInBase;

    // Convert realized gain to base currency (still needed as it's in original currency)
    const realizedGainInBase = await calculateRefAmount({
      amount: parseFloat(holding.realizedGainValue || '0'),
      userId,
      date: conversionDate,
      baseCode: holding.currencyCode,
      quoteCode: baseCurrencyCode,
    });

    totalCurrentValueInBase += marketValueInBase;
    totalCostBasisInBase += costBasisInBase;
    totalUnrealizedGainInBase += unrealizedGainInBase;
    totalRealizedGainInBase += realizedGainInBase;
  }

  // Calculate percentages
  const unrealizedGainPercent =
    totalCostBasisInBase !== 0 ? (totalUnrealizedGainInBase / totalCostBasisInBase) * 100 : 0;

  const realizedGainPercent = totalCostBasisInBase !== 0 ? (totalRealizedGainInBase / totalCostBasisInBase) * 100 : 0;

  return {
    portfolioId,
    portfolioName: portfolio.name,
    totalCurrentValue: totalCurrentValueInBase.toFixed(2),
    totalCostBasis: totalCostBasisInBase.toFixed(2),
    unrealizedGainValue: totalUnrealizedGainInBase.toFixed(2),
    unrealizedGainPercent: unrealizedGainPercent.toFixed(2),
    realizedGainValue: totalRealizedGainInBase.toFixed(2),
    realizedGainPercent: realizedGainPercent.toFixed(2),
    currencyCode: baseCurrencyCode,
  };
};

export const getPortfolioSummary = withTransaction(getPortfolioSummaryImpl);
