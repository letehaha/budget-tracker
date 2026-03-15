import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import PortfolioBalances from '@models/investments/PortfolioBalances.model';
import Portfolios from '@models/investments/Portfolios.model';
import * as UsersCurrencies from '@models/UsersCurrencies.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common/with-transaction';
import { getHoldingValues } from '@services/investments/holdings/get-holding-values.service';

interface GetPortfolioSummaryParams {
  userId: number;
  portfolioId: number;
  date?: Date;
}

interface PortfolioSummaryResult {
  portfolioId: number;
  portfolioName: string;
  totalCurrentValue: string;
  totalCostBasis: string;
  unrealizedGainValue: string;
  unrealizedGainPercent: string;
  realizedGainValue: string;
  realizedGainPercent: string;
  currencyCode: string; // User's base currency
  totalCashInBaseCurrency: string;
  availableCashInBaseCurrency: string;
  totalPortfolioValue: string; // Holdings value + cash
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

  // Fetch portfolio cash balances across all currencies
  const balances = await PortfolioBalances.findAll({
    where: { portfolioId },
  });

  let totalCashInBase = Money.zero();
  let availableCashInBase = Money.zero();

  for (const balance of balances) {
    totalCashInBase = totalCashInBase.add(balance.refTotalCash);
    availableCashInBase = availableCashInBase.add(balance.refAvailableCash);
  }

  // Get all holdings with their gain/loss calculations
  const holdings = await getHoldingValues({ portfolioId, date, userId });

  if (holdings.length === 0) {
    // Return zero values for holdings but include cash
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
      totalCashInBaseCurrency: totalCashInBase.toNumber().toFixed(2),
      availableCashInBaseCurrency: availableCashInBase.toNumber().toFixed(2),
      totalPortfolioValue: totalCashInBase.toNumber().toFixed(2),
    };
  }

  // Aggregate values using reference currency amounts (already converted)
  let totalCurrentValueInBase = Money.zero();
  let totalCostBasisInBase = Money.zero();
  let totalUnrealizedGainInBase = Money.zero();
  let totalRealizedGainInBase = Money.zero();

  const conversionDate = date || new Date();

  for (const holding of holdings) {
    // Use reference currency values (already converted to user's base currency)
    const marketValueInBase = Money.fromDecimal(holding.refMarketValue || '0');
    const costBasisInBase = Money.fromDecimal(holding.refCostBasis || '0');

    // Calculate unrealized gain in reference currency
    const unrealizedGainInBase = marketValueInBase.subtract(costBasisInBase);

    // Convert realized gain to base currency (still needed as it's in original currency)
    const realizedGainInBase = await calculateRefAmount({
      amount: Money.fromDecimal(holding.realizedGainValue || '0'),
      userId,
      date: conversionDate,
      baseCode: holding.currencyCode,
      quoteCode: baseCurrencyCode,
    });

    totalCurrentValueInBase = totalCurrentValueInBase.add(marketValueInBase);
    totalCostBasisInBase = totalCostBasisInBase.add(costBasisInBase);
    totalUnrealizedGainInBase = totalUnrealizedGainInBase.add(unrealizedGainInBase);
    totalRealizedGainInBase = totalRealizedGainInBase.add(realizedGainInBase);
  }

  // Calculate percentages
  const costBasisNum = totalCostBasisInBase.toNumber();
  const unrealizedGainPercent = costBasisNum !== 0 ? (totalUnrealizedGainInBase.toNumber() / costBasisNum) * 100 : 0;

  const realizedGainPercent = costBasisNum !== 0 ? (totalRealizedGainInBase.toNumber() / costBasisNum) * 100 : 0;

  return {
    portfolioId,
    portfolioName: portfolio.name,
    totalCurrentValue: totalCurrentValueInBase.toNumber().toFixed(2),
    totalCostBasis: totalCostBasisInBase.toNumber().toFixed(2),
    unrealizedGainValue: totalUnrealizedGainInBase.toNumber().toFixed(2),
    unrealizedGainPercent: unrealizedGainPercent.toFixed(2),
    realizedGainValue: totalRealizedGainInBase.toNumber().toFixed(2),
    realizedGainPercent: realizedGainPercent.toFixed(2),
    currencyCode: baseCurrencyCode,
    totalCashInBaseCurrency: totalCashInBase.toNumber().toFixed(2),
    availableCashInBaseCurrency: availableCashInBase.toNumber().toFixed(2),
    totalPortfolioValue: totalCurrentValueInBase.add(totalCashInBase).toNumber().toFixed(2),
  };
};

export const getPortfolioSummary = withTransaction(getPortfolioSummaryImpl);
