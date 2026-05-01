import { Money } from '@common/types/money';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import PortfolioBalances from '@models/investments/portfolio-balances.model';
import PortfolioTransfers from '@models/investments/portfolio-transfers.model';
import Portfolios from '@models/investments/portfolios.model';
import * as UsersCurrencies from '@models/users-currencies.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common/with-transaction';
import { getHoldingValues } from '@services/investments/holdings/get-holding-values.service';
import { calculateRefCashDelta } from '@services/investments/transactions/cash-balance-utils';
import { Op } from 'sequelize';

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

const isDeposit = ({ tr, portfolioId }: { tr: PortfolioTransfers; portfolioId: number }) =>
  tr.toPortfolioId === portfolioId && tr.fromPortfolioId !== portfolioId;

const isWithdrawal = ({ tr, portfolioId }: { tr: PortfolioTransfers; portfolioId: number }) =>
  tr.fromPortfolioId === portfolioId && tr.toPortfolioId !== portfolioId;

async function getCashTotalsInBase({
  userId,
  portfolioId,
  date,
}: {
  userId: number;
  portfolioId: number;
  date?: Date;
}) {
  if (!date) {
    const balances = await PortfolioBalances.findAll({
      where: { portfolioId },
    });

    let totalCashInBase = Money.zero();
    let availableCashInBase = Money.zero();

    for (const balance of balances) {
      totalCashInBase = totalCashInBase.add(balance.refTotalCash);
      availableCashInBase = availableCashInBase.add(balance.refAvailableCash);
    }

    return { totalCashInBase, availableCashInBase };
  }

  const [transfers, investmentTxs] = await Promise.all([
    PortfolioTransfers.findAll({
      where: {
        userId,
        isHistorical: false,
        date: { [Op.lte]: date.toISOString().slice(0, 10) },
        [Op.or]: [{ fromPortfolioId: portfolioId }, { toPortfolioId: portfolioId }],
      },
    }),
    InvestmentTransaction.findAll({
      where: {
        portfolioId,
        date: { [Op.lte]: date.toISOString().slice(0, 10) },
      },
    }),
  ]);

  let cashTotal = 0;
  for (const tr of transfers) {
    if (tr.toCurrencyCode && tr.toAmount && tr.fromPortfolioId === portfolioId && tr.toPortfolioId === portfolioId) {
      cashTotal -= tr.refAmount.toNumber();
      cashTotal += tr.refToAmount?.toNumber() ?? 0;
      continue;
    }

    if (isDeposit({ tr, portfolioId })) cashTotal += tr.refAmount.toNumber();
    else if (isWithdrawal({ tr, portfolioId })) cashTotal -= tr.refAmount.toNumber();
  }

  for (const tx of investmentTxs) {
    const delta = calculateRefCashDelta({
      category: tx.category,
      refFees: tx.refFees.toDecimalString(10),
      refAmount: tx.refAmount.toDecimalString(10),
    });
    if (delta !== null) cashTotal += delta;
  }

  const cash = Money.fromDecimal(cashTotal.toFixed(10));
  return { totalCashInBase: cash, availableCashInBase: cash };
}

const getPortfolioSummaryImpl = async ({
  userId,
  portfolioId,
  date,
}: GetPortfolioSummaryParams): Promise<PortfolioSummaryResult> => {
  // Verify portfolio exists and belongs to user
  const portfolio = await findOrThrowNotFound({
    query: Portfolios.findOne({
      where: { id: portfolioId, userId },
    }),
    message: t({ key: 'investments.portfolioNotFound' }),
  });

  // Get user's base currency
  const userCurrency = await findOrThrowNotFound({
    query: UsersCurrencies.getCurrency({
      userId,
      isDefaultCurrency: true,
    }),
    message: t({ key: 'investments.userBaseCurrencyNotFound' }),
  });

  const baseCurrencyCode = userCurrency.currency.code;

  const { totalCashInBase, availableCashInBase } = await getCashTotalsInBase({ userId, portfolioId, date });

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
  let totalRealizedCostBasisInBase = Money.zero();

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
    const realizedCostBasisInBase = await calculateRefAmount({
      amount: Money.fromDecimal(holding.realizedCostBasis || '0'),
      userId,
      date: conversionDate,
      baseCode: holding.currencyCode,
      quoteCode: baseCurrencyCode,
    });

    totalCurrentValueInBase = totalCurrentValueInBase.add(marketValueInBase);
    totalCostBasisInBase = totalCostBasisInBase.add(costBasisInBase);
    totalUnrealizedGainInBase = totalUnrealizedGainInBase.add(unrealizedGainInBase);
    totalRealizedGainInBase = totalRealizedGainInBase.add(realizedGainInBase);
    totalRealizedCostBasisInBase = totalRealizedCostBasisInBase.add(realizedCostBasisInBase);
  }

  // Calculate percentages
  const costBasisNum = totalCostBasisInBase.toNumber();
  const unrealizedGainPercent = costBasisNum !== 0 ? (totalUnrealizedGainInBase.toNumber() / costBasisNum) * 100 : 0;

  const realizedCostBasisNum = totalRealizedCostBasisInBase.toNumber();
  const realizedGainPercent =
    realizedCostBasisNum !== 0 ? (totalRealizedGainInBase.toNumber() / realizedCostBasisNum) * 100 : 0;

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
