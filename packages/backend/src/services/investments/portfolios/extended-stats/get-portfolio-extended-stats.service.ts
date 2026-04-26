import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments/enums';
import type {
  PortfolioExtendedStatsModel,
  PortfolioPerformer,
} from '@bt/shared/types/investments/portfolio-extended-stats.model';
import { Money } from '@common/types/money';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { CacheClient } from '@js/utils/cache';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import PortfolioBalances from '@models/investments/portfolio-balances.model';
import PortfolioTransfers from '@models/investments/portfolio-transfers.model';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import * as UsersCurrencies from '@models/users-currencies.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common/with-transaction';
import { getHoldingValues } from '@services/investments/holdings/get-holding-values.service';
import { Op } from 'sequelize';

import { type DividendFlow, type ExternalCashFlow, summarizeCashFlows } from './utils/cash-flow-summary';
import { calculateClosedPositions } from './utils/closed-positions';
import { type TwrPoint, calculateTwr } from './utils/twr';
import { type XirrCashFlow, calculateXirr } from './utils/xirr';

const CACHE_TTL_SECONDS = 12 * 60 * 60; // 12h

// Skip the Redis cache in development so iterating on the calculation always
// reflects the latest code; production and tests still cache.
const CACHE_ENABLED = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test';

const cache = new CacheClient<PortfolioExtendedStatsModel>({
  ttl: CACHE_TTL_SECONDS,
  logPrefix: 'portfolio-extended-stats',
  parseJson: true,
});

const buildCacheKey = ({ userId, portfolioId }: { userId: number; portfolioId: number }) =>
  `portfolio-extended-stats:${userId}:${portfolioId}`;

/**
 * Invalidate the cached extended-stats response for a single portfolio. Called
 * from any mutation service that changes cash flows or holdings.
 */
export const invalidatePortfolioExtendedStatsCache = async ({
  userId,
  portfolioId,
}: {
  userId: number;
  portfolioId: number;
}) => cache.delete(buildCacheKey({ userId, portfolioId }));

const fmt = (n: number, dp = 2): string => n.toFixed(dp);

// Cap displayed annualized returns at +/- 1000% (10x). Beyond that, the value
// reflects either a portfolio too young to annualize or data-entry gaps
// (e.g. holdings recorded without matching deposits) — neither produces a
// meaningful "yearly return", so we surface it as "—" with a tooltip hint
// rather than displaying nonsense numbers like "+4,000,000%".
const ANNUALIZED_RETURN_CAP = 10;

const pctOrNull = (n: number | null): string | null => {
  if (n === null || !Number.isFinite(n)) return null;
  if (Math.abs(n) > ANNUALIZED_RETURN_CAP) return null;
  return (n * 100).toFixed(2);
};

const isDeposit = ({ tr, portfolioId }: { tr: PortfolioTransfers; portfolioId: number }) =>
  tr.toPortfolioId === portfolioId && tr.fromPortfolioId !== portfolioId;

const isWithdrawal = ({ tr, portfolioId }: { tr: PortfolioTransfers; portfolioId: number }) =>
  tr.fromPortfolioId === portfolioId && tr.toPortfolioId !== portfolioId;

const convertToBase = async ({
  amount,
  baseCode,
  quoteCode,
  userId,
  date,
}: {
  amount: number;
  baseCode: string;
  quoteCode: string;
  userId: number;
  date: Date;
}): Promise<number> => {
  if (baseCode === quoteCode) return amount;
  if (amount === 0) return 0;
  try {
    const result = await calculateRefAmount({
      amount: Money.fromDecimal(Math.abs(amount)),
      userId,
      baseCode,
      quoteCode,
      date,
    });
    return amount < 0 ? -result.toNumber() : result.toNumber();
  } catch {
    return amount;
  }
};

interface GetPortfolioExtendedStatsParams {
  userId: number;
  portfolioId: number;
}

const getPortfolioExtendedStatsImpl = async ({
  userId,
  portfolioId,
}: GetPortfolioExtendedStatsParams): Promise<PortfolioExtendedStatsModel> => {
  const cacheKey = buildCacheKey({ userId, portfolioId });
  if (CACHE_ENABLED) {
    const cached = await cache.read(cacheKey);
    if (cached) return cached;
  }

  const portfolio = await findOrThrowNotFound({
    query: Portfolios.findOne({ where: { id: portfolioId, userId } }),
    message: t({ key: 'investments.portfolioNotFound' }),
  });

  const userCurrency = await findOrThrowNotFound({
    query: UsersCurrencies.getCurrency({ userId, isDefaultCurrency: true }),
    message: t({ key: 'investments.userBaseCurrencyNotFound' }),
  });
  const baseCurrencyCode = userCurrency.currency.code;

  const referenceDate = new Date();

  const [transfers, investmentTxs, holdingValues, portfolioBalances] = await Promise.all([
    PortfolioTransfers.findAll({
      where: {
        userId,
        [Op.or]: [{ fromPortfolioId: portfolioId }, { toPortfolioId: portfolioId }],
      },
      order: [['date', 'ASC']],
    }),
    InvestmentTransaction.findAll({
      where: { portfolioId },
      include: [{ model: Securities, as: 'security', required: true }],
      order: [['date', 'ASC']],
    }),
    getHoldingValues({ portfolioId, userId }),
    PortfolioBalances.findAll({ where: { portfolioId } }),
  ]);

  const externalFlows: ExternalCashFlow[] = [];
  const xirrFlows: XirrCashFlow[] = [];
  for (const tr of transfers) {
    const inflow = isDeposit({ tr, portfolioId });
    const outflow = isWithdrawal({ tr, portfolioId });
    if (!inflow && !outflow) continue; // currency exchange within same portfolio
    const amount = tr.refAmount.toNumber();
    if (inflow) {
      externalFlows.push({ date: tr.date, direction: 'deposit', amount });
      xirrFlows.push({ date: tr.date, amount: -amount });
    } else {
      externalFlows.push({ date: tr.date, direction: 'withdrawal', amount });
      xirrFlows.push({ date: tr.date, amount });
    }
  }

  const dividends: DividendFlow[] = [];
  for (const tx of investmentTxs) {
    if (tx.category !== INVESTMENT_TRANSACTION_CATEGORY.dividend) continue;
    dividends.push({ date: tx.date, amount: tx.refAmount.toNumber() });
  }

  // Portfolio age starts at the first buy, not the first deposit.
  let firstBuyDate: Date | null = null;
  for (const tx of investmentTxs) {
    if (tx.category !== INVESTMENT_TRANSACTION_CATEGORY.buy) continue;
    const d = new Date(tx.date);
    if (firstBuyDate === null || d < firstBuyDate) firstBuyDate = d;
  }

  const cashFlowSummary = summarizeCashFlows({ externalFlows, dividends, referenceDate, firstBuyDate });

  // Group transactions by security for closed-position analysis & performers.
  const txsBySecurity = new Map<number, InvestmentTransaction[]>();
  for (const tx of investmentTxs) {
    const list = txsBySecurity.get(tx.securityId) ?? [];
    list.push(tx);
    txsBySecurity.set(tx.securityId, list);
  }

  const closedPositionEntries: PortfolioPerformer[] = [];
  let closedCount = 0;
  let winningCount = 0;
  let totalGainBase = 0;
  let totalGainPercent = 0;

  for (const [, txs] of txsBySecurity) {
    const sample = txs[0];
    if (!sample) continue;
    const security = sample.security;
    const securityCurrency = sample.currencyCode;
    const positions = calculateClosedPositions({
      transactions: txs.map((tx) => ({
        date: tx.date,
        category: tx.category,
        quantity: tx.quantity.toNumber(),
        price: tx.price.toNumber(),
        fees: tx.fees.toNumber(),
      })),
    });
    for (const pos of positions) {
      const gainInBase = await convertToBase({
        amount: pos.gain,
        baseCode: securityCurrency,
        quoteCode: baseCurrencyCode,
        userId,
        date: pos.closedAt,
      });
      closedCount += 1;
      if (gainInBase > 0) winningCount += 1;
      totalGainBase += gainInBase;
      totalGainPercent += pos.gainPercent;

      closedPositionEntries.push({
        securityId: sample.securityId,
        symbol: security?.symbol ?? null,
        name: security?.name ?? null,
        returnValue: fmt(gainInBase),
        returnPercent: fmt(pos.gainPercent),
      });
    }
  }

  const winRate = closedCount > 0 ? (winningCount / closedCount) * 100 : 0;
  const avgGain = closedCount > 0 ? totalGainBase / closedCount : 0;
  const avgGainPercent = closedCount > 0 ? totalGainPercent / closedCount : 0;

  // Performers: open holdings (unrealized) + each closed position cycle.
  const openPositionEntries: PortfolioPerformer[] = holdingValues
    .filter((h) => h.unrealizedGainValue !== undefined && h.unrealizedGainPercent !== undefined)
    .map((h) => ({
      securityId: h.securityId,
      symbol: h.security?.symbol ?? null,
      name: h.security?.name ?? null,
      returnValue: parseFloat(h.unrealizedGainValue!).toFixed(2),
      returnPercent: parseFloat(h.unrealizedGainPercent!).toFixed(2),
    }));
  const performers = pickPerformers([...openPositionEntries, ...closedPositionEntries]);

  // Current portfolio value: cash (refTotalCash sum) + holdings (refMarketValue sum).
  let currentPortfolioValue = 0;
  for (const b of portfolioBalances) currentPortfolioValue += b.refTotalCash.toNumber();
  for (const h of holdingValues) {
    if (h.refMarketValue) currentPortfolioValue += parseFloat(h.refMarketValue);
  }

  // IRR includes the current portfolio value as a positive terminal flow.
  if (currentPortfolioValue > 0) xirrFlows.push({ date: referenceDate, amount: currentPortfolioValue });
  const irr = calculateXirr({ cashFlows: xirrFlows });

  const twr = await computeTwr({
    portfolioId,
    userId,
    baseCurrencyCode,
    referenceDate,
    investmentTxs,
    transfers,
    currentPortfolioValue,
  });

  const result: PortfolioExtendedStatsModel = {
    portfolioId: portfolio.id,
    currencyCode: baseCurrencyCode,

    totalDeposits: fmt(cashFlowSummary.totalDeposits),
    totalWithdrawals: fmt(cashFlowSummary.totalWithdrawals),
    netInvested: fmt(cashFlowSummary.netInvested),
    totalDividends: fmt(cashFlowSummary.totalDividends),
    averageMonthlyDividends:
      cashFlowSummary.averageMonthlyDividends === null ? null : fmt(cashFlowSummary.averageMonthlyDividends),
    firstTransactionDate: cashFlowSummary.firstTransactionDate,
    portfolioAgeDays: cashFlowSummary.portfolioAgeDays ?? 0,

    irr: pctOrNull(irr),
    twr: pctOrNull(twr),

    bestPerformerByPercent: performers.bestByPercent,
    worstPerformerByPercent: performers.worstByPercent,
    bestPerformerByValue: performers.bestByValue,
    worstPerformerByValue: performers.worstByValue,

    closedPositionsCount: closedCount,
    winningPositionsCount: winningCount,
    winRate: fmt(winRate),
    avgReturnPerClosedPosition: fmt(avgGain),
    avgReturnPerClosedPositionPercent: fmt(avgGainPercent),
  };

  if (CACHE_ENABLED) await cache.write({ key: cacheKey, value: result });
  return result;
};

const pickPerformers = (
  entries: PortfolioPerformer[],
): {
  bestByPercent: PortfolioPerformer | null;
  worstByPercent: PortfolioPerformer | null;
  bestByValue: PortfolioPerformer | null;
  worstByValue: PortfolioPerformer | null;
} => {
  if (entries.length === 0) {
    return { bestByPercent: null, worstByPercent: null, bestByValue: null, worstByValue: null };
  }
  const byPercent = entries.toSorted((a, b) => parseFloat(b.returnPercent) - parseFloat(a.returnPercent));
  const byValue = entries.toSorted((a, b) => parseFloat(b.returnValue) - parseFloat(a.returnValue));
  return {
    bestByPercent: byPercent[0]!,
    worstByPercent: byPercent[byPercent.length - 1]!,
    bestByValue: byValue[0]!,
    worstByValue: byValue[byValue.length - 1]!,
  };
};

/**
 * Sub-period TWR. For each external cash-flow date, reconstruct the portfolio's
 * base-currency value (holdings × historical close price + cash balance walk),
 * then chain the per-segment market returns.
 *
 * Historical (backfilled) transfers are excluded throughout: the cash never
 * actually moved on those dates, so they neither create new TWR segments nor
 * affect the reconstructed cash balance at any point in time. They still
 * participate in IRR via xirrFlows.
 */
const computeTwr = async ({
  portfolioId,
  userId,
  baseCurrencyCode,
  referenceDate,
  investmentTxs,
  transfers,
  currentPortfolioValue,
}: {
  portfolioId: number;
  userId: number;
  baseCurrencyCode: string;
  referenceDate: Date;
  investmentTxs: InvestmentTransaction[];
  transfers: PortfolioTransfers[];
  currentPortfolioValue: number;
}): Promise<number | null> => {
  const realTransfers = transfers.filter((tr) => !tr.isHistorical);

  const flows = realTransfers
    .filter((tr) => isDeposit({ tr, portfolioId }) || isWithdrawal({ tr, portfolioId }))
    .map((tr) => ({
      date: new Date(tr.date),
      cashFlow: isDeposit({ tr, portfolioId }) ? tr.refAmount.toNumber() : -tr.refAmount.toNumber(),
    }))
    .toSorted((a, b) => a.date.getTime() - b.date.getTime());

  if (flows.length === 0) return null;

  const securityIds = Array.from(new Set(investmentTxs.map((tx) => tx.securityId)));
  const pricings = securityIds.length
    ? await SecurityPricing.findAll({
        where: { securityId: { [Op.in]: securityIds } },
        order: [['date', 'ASC']],
      })
    : [];
  const pricingsBySecurity = new Map<number, SecurityPricing[]>();
  for (const p of pricings) {
    const list = pricingsBySecurity.get(p.securityId) ?? [];
    list.push(p);
    pricingsBySecurity.set(p.securityId, list);
  }
  const securityCurrency = new Map<number, string>();
  for (const tx of investmentTxs) {
    if (!securityCurrency.has(tx.securityId)) securityCurrency.set(tx.securityId, tx.currencyCode);
  }

  const valueAt = async (date: Date): Promise<number> => {
    const qtyBySecurity = new Map<number, number>();
    for (const tx of investmentTxs) {
      if (new Date(tx.date) > date) continue;
      const q = qtyBySecurity.get(tx.securityId) ?? 0;
      if (tx.category === INVESTMENT_TRANSACTION_CATEGORY.buy) {
        qtyBySecurity.set(tx.securityId, q + tx.quantity.toNumber());
      } else if (tx.category === INVESTMENT_TRANSACTION_CATEGORY.sell) {
        qtyBySecurity.set(tx.securityId, q - tx.quantity.toNumber());
      }
    }

    let holdingsValue = 0;
    for (const [securityId, qty] of qtyBySecurity) {
      if (qty === 0) continue;
      const list = pricingsBySecurity.get(securityId) ?? [];
      let price: number | null = null;
      for (let i = list.length - 1; i >= 0; i--) {
        if (new Date(list[i]!.date) <= date) {
          price = list[i]!.priceClose.toNumber();
          break;
        }
      }
      if (price === null) continue;
      const native = qty * price;
      const code = securityCurrency.get(securityId) ?? baseCurrencyCode;
      holdingsValue += await convertToBase({
        amount: native,
        baseCode: code,
        quoteCode: baseCurrencyCode,
        userId,
        date,
      });
    }

    // Reconstruct ref-currency cash balance: deposits/withdrawals + buy/sell + dividend ± fee/tax.
    // Uses real transfers only — historical backfills never moved cash.
    let cashApprox = 0;
    for (const tr of realTransfers) {
      if (new Date(tr.date) > date) continue;
      if (isDeposit({ tr, portfolioId })) cashApprox += tr.refAmount.toNumber();
      else if (isWithdrawal({ tr, portfolioId })) cashApprox -= tr.refAmount.toNumber();
    }
    for (const tx of investmentTxs) {
      if (new Date(tx.date) > date) continue;
      const refAmt = tx.refAmount.toNumber();
      switch (tx.category) {
        case INVESTMENT_TRANSACTION_CATEGORY.buy:
          cashApprox -= refAmt;
          break;
        case INVESTMENT_TRANSACTION_CATEGORY.sell:
          cashApprox += refAmt;
          break;
        case INVESTMENT_TRANSACTION_CATEGORY.dividend:
          cashApprox += refAmt;
          break;
        case INVESTMENT_TRANSACTION_CATEGORY.fee:
        case INVESTMENT_TRANSACTION_CATEGORY.tax:
          cashApprox -= refAmt;
          break;
        default:
          break;
      }
    }

    return holdingsValue + cashApprox;
  };

  const points: TwrPoint[] = [];
  const firstDate = flows[0]!.date;
  points.push({ date: firstDate, value: await valueAt(firstDate), cashFlow: 0 });
  for (let i = 1; i < flows.length; i++) {
    const f = flows[i]!;
    points.push({ date: f.date, value: await valueAt(f.date), cashFlow: f.cashFlow });
  }
  points.push({ date: referenceDate, value: currentPortfolioValue, cashFlow: 0 });

  return calculateTwr({ points })?.annualizedReturn ?? null;
};

export const getPortfolioExtendedStats = withTransaction(getPortfolioExtendedStatsImpl);
