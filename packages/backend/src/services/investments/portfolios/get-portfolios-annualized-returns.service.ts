import { ASSET_CLASS, INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types';
import type { PortfolioAnnualizedReturnModel } from '@bt/shared/types/investments/portfolio-annualized-return.model';
import { Money } from '@common/types/money';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import UsersCurrencies from '@models/users-currencies.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common/with-transaction';
import { differenceInDays, format, parseISO } from 'date-fns';
import { Op } from 'sequelize';

/**
 * Minimum tracked history (in days) before an annualized figure is shown.
 * Annualizing a return from a few weeks of data inflates noise into a wild
 * yearly number, so anything shorter is reported as "not enough history".
 */
const MIN_HISTORY_DAYS = 180;

/** Unit amount used to derive a currency→base rate from `calculateRefAmount`. */
const FX_PROBE_UNITS = 10_000;

const formatDate = (date: Date | string): string => format(date, 'yyyy-MM-dd');

interface GetPortfoliosAnnualizedReturnsParams {
  userId: number;
}

type TransactionRow = Pick<
  InvestmentTransaction,
  'portfolioId' | 'securityId' | 'category' | 'date' | 'quantity' | 'refAmount' | 'refFees'
>;

/** Running per-security position used to value the portfolio over time. */
interface HoldingState {
  quantity: number;
  /**
   * Total cost basis in the user's base currency. Used as the valuation
   * fallback when no market price is available on a given date (e.g. a
   * back-dated buy that precedes the security's price history).
   */
  costBasis: number;
}

/**
 * Computes the annualized time-weighted return (TWR) of each enabled portfolio
 * over its full tracked history, expressed in the user's base currency.
 *
 * TWR is the right metric for the investment calculator: it measures how the
 * *holdings themselves* performed, stripping out the timing and size of the
 * user's contributions (the calculator already models contributions separately,
 * so a contribution-sensitive metric like XIRR would double-count them).
 *
 * Method — daily values aren't stored, so the portfolio is valued only at the
 * dates where holdings change (every buy/sell) plus today. Between two such
 * boundaries the holdings are fixed, so the sub-period return collapses to a
 * pure price ratio `value(end) / value(start)`. Chaining those ratios yields
 * the TWR; dividends received within a sub-period are added to its ending value
 * as return-without-new-capital. Buys/sells are NOT treated as returns because
 * the same day-close price is used for both the valuation and the share delta,
 * so a trade contributes ~0 to its own day's return.
 */
const getPortfoliosAnnualizedReturnsImpl = async ({
  userId,
}: GetPortfoliosAnnualizedReturnsParams): Promise<PortfolioAnnualizedReturnModel[]> => {
  const [userBaseCurrency, portfolios] = await Promise.all([
    UsersCurrencies.findOne({
      where: { userId, isDefaultCurrency: true },
      raw: true,
      attributes: ['currencyCode'],
    }) as Promise<Pick<UsersCurrencies, 'currencyCode'> | null>,
    Portfolios.findAll({
      where: { userId, isEnabled: true },
      attributes: ['id', 'name'],
      raw: true,
    }) as Promise<Pick<Portfolios, 'id' | 'name'>[]>,
  ]);

  if (!userBaseCurrency?.currencyCode || portfolios.length === 0) {
    return [];
  }

  const baseCurrencyCode = userBaseCurrency.currencyCode;
  const today = formatDate(new Date());
  const portfolioIds = portfolios.map((p) => p.id);

  // Only buys/sells (holdings changes) and dividends (income return) matter for
  // TWR. Other categories (transfer, fee, tax, cancel, other) are cash-side
  // movements that don't affect security market value or investment return.
  const transactions: TransactionRow[] = await InvestmentTransaction.findAll({
    where: {
      portfolioId: { [Op.in]: portfolioIds },
      category: {
        [Op.in]: [
          INVESTMENT_TRANSACTION_CATEGORY.buy,
          INVESTMENT_TRANSACTION_CATEGORY.sell,
          INVESTMENT_TRANSACTION_CATEGORY.dividend,
        ],
      },
      date: { [Op.lte]: today },
    },
    order: [
      ['portfolioId', 'ASC'],
      ['date', 'ASC'],
      ['createdAt', 'ASC'],
    ],
    attributes: ['portfolioId', 'securityId', 'category', 'date', 'quantity', 'refAmount', 'refFees'],
  });

  const securityIds = [...new Set(transactions.map((t) => t.securityId))];

  type SecurityRow = Pick<Securities, 'id' | 'currencyCode' | 'assetClass'>;
  const securities: SecurityRow[] = securityIds.length
    ? ((await Securities.findAll({
        where: { id: { [Op.in]: securityIds } },
        attributes: ['id', 'currencyCode', 'assetClass'],
        raw: true,
      })) as SecurityRow[])
    : [];
  const securitiesById = new Map(securities.map((s) => [String(s.id), s]));

  // One price series per security, ascending by date, for O(log n)-ish fallback
  // lookups ("latest price on or before a date" covers weekends/holidays).
  type SecurityPriceRow = Pick<SecurityPricing, 'securityId' | 'date' | 'priceClose'>;
  const securityPrices: SecurityPriceRow[] = securityIds.length
    ? ((await SecurityPricing.findAll({
        where: { securityId: { [Op.in]: securityIds } },
        order: [
          ['securityId', 'ASC'],
          ['date', 'ASC'],
        ],
        attributes: ['securityId', 'date', 'priceClose'],
      })) as SecurityPriceRow[])
    : [];

  const pricesBySecurity = new Map<string, Array<{ date: string; price: number }>>();
  for (const row of securityPrices) {
    const dateStr = formatDate(row.date);
    const list = pricesBySecurity.get(row.securityId);
    const entry = { date: dateStr, price: row.priceClose.toNumber() };
    if (list) {
      // Crypto carries intraday rows; later same-day write wins the daily bucket.
      const last = list[list.length - 1];
      if (last && last.date === dateStr) last.price = entry.price;
      else list.push(entry);
    } else {
      pricesBySecurity.set(row.securityId, [entry]);
    }
  }

  const findPriceForDate = (securityId: string, targetDate: string): number | null => {
    const prices = pricesBySecurity.get(securityId);
    if (!prices || prices.length === 0) return null;
    let latest: number | null = null;
    for (const p of prices) {
      if (p.date <= targetDate) latest = p.price;
      else break;
    }
    return latest;
  };

  // Memoized `1 unit of <currency>` → base-currency rate at a given date.
  const fxCache = new Map<string, number>();
  const getFxRate = async (currencyCode: string, dateStr: string): Promise<number> => {
    if (currencyCode === baseCurrencyCode) return 1;
    const key = `${currencyCode}_${dateStr}`;
    const cached = fxCache.get(key);
    if (cached !== undefined) return cached;
    const converted = await calculateRefAmount({
      amount: Money.fromDecimal(FX_PROBE_UNITS),
      userId,
      date: dateStr,
      baseCode: currencyCode,
      quoteCode: baseCurrencyCode,
    });
    const rate = converted.toNumber() / FX_PROBE_UNITS;
    fxCache.set(key, rate);
    return rate;
  };

  // Market value (base currency) of a holdings map valued at `dateStr`.
  const valueHoldings = async (holdings: Map<string, HoldingState>, dateStr: string): Promise<number> => {
    let total = 0;
    for (const [securityId, holding] of holdings) {
      const security = securitiesById.get(securityId);
      // Stocks can't be negative; crypto may legitimately drift negative.
      const allowNegative = security?.assetClass === ASSET_CLASS.crypto;
      const effectiveQuantity = !allowNegative && holding.quantity < 0 ? 0 : holding.quantity;
      if (effectiveQuantity === 0) continue;
      const price = findPriceForDate(securityId, dateStr);
      if (price === null) {
        // No market price on/before this date (e.g. a back-dated buy that
        // precedes the security's price history). Fall back to cost basis —
        // already in base currency — so the position is valued consistently at
        // both ends of a sub-period instead of jumping 0 → market value and
        // injecting a phantom return. Mirrors `get-combined-balance-history`.
        total += holding.costBasis;
        continue;
      }
      const rate = await getFxRate(security?.currencyCode ?? baseCurrencyCode, dateStr);
      total += effectiveQuantity * price * rate;
    }
    return total;
  };

  const transactionsByPortfolio = new Map<string, TransactionRow[]>();
  for (const tx of transactions) {
    const list = transactionsByPortfolio.get(tx.portfolioId);
    if (list) list.push(tx);
    else transactionsByPortfolio.set(tx.portfolioId, [tx]);
  }

  const results: PortfolioAnnualizedReturnModel[] = [];

  for (const portfolio of portfolios) {
    const portfolioTxs = transactionsByPortfolio.get(portfolio.id) ?? [];
    const tradeTxs = portfolioTxs.filter(
      (t) => t.category === INVESTMENT_TRANSACTION_CATEGORY.buy || t.category === INVESTMENT_TRANSACTION_CATEGORY.sell,
    );

    if (tradeTxs.length === 0) {
      results.push({
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
        annualizedReturn: null,
        hasEnoughHistory: false,
        startDate: null,
        periodDays: 0,
        currencyCode: baseCurrencyCode,
      });
      continue;
    }

    const startDate = tradeTxs[0]!.date;
    const periodDays = differenceInDays(parseISO(today), parseISO(startDate));

    if (periodDays < MIN_HISTORY_DAYS) {
      results.push({
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
        annualizedReturn: null,
        hasEnoughHistory: false,
        startDate,
        periodDays: Math.max(periodDays, 0),
        currencyCode: baseCurrencyCode,
      });
      continue;
    }

    // Group trades by date and collect dividends as a sorted list of returns.
    const tradesByDate = new Map<string, TransactionRow[]>();
    const dividends: Array<{ date: string; amount: number }> = [];
    for (const tx of portfolioTxs) {
      if (tx.category === INVESTMENT_TRANSACTION_CATEGORY.dividend) {
        dividends.push({ date: tx.date, amount: tx.refAmount.toNumber() });
        continue;
      }
      const list = tradesByDate.get(tx.date);
      if (list) list.push(tx);
      else tradesByDate.set(tx.date, [tx]);
    }

    const boundaryDates = [...tradesByDate.keys()].toSorted();
    if (boundaryDates[boundaryDates.length - 1] !== today) boundaryDates.push(today);

    const holdings = new Map<string, HoldingState>();
    let cumulativeFactor = 1;
    let prevValue = 0;
    let prevDate: string | null = null;
    let started = false;
    let dividendIdx = 0;

    for (const boundaryDate of boundaryDates) {
      // Close the open sub-period: value the (unchanged) holdings at this date.
      if (prevDate !== null && prevValue > 0) {
        const valueBefore = await valueHoldings(holdings, boundaryDate);
        let dividendsInPeriod = 0;
        while (dividendIdx < dividends.length && dividends[dividendIdx]!.date <= boundaryDate) {
          if (dividends[dividendIdx]!.date > prevDate) dividendsInPeriod += dividends[dividendIdx]!.amount;
          dividendIdx += 1;
        }
        cumulativeFactor *= (valueBefore + dividendsInPeriod) / prevValue;
      }

      // Apply this date's trades to the running holdings. Cost-basis tracking
      // mirrors `recalculateHolding` / `get-combined-balance-history` so an
      // oversell (allowed for crypto) doesn't corrupt the basis used as the
      // no-price valuation fallback.
      for (const tx of tradesByDate.get(boundaryDate) ?? []) {
        const quantity = tx.quantity.toNumber();
        const totalAmount = tx.refAmount.toNumber() + tx.refFees.toNumber();
        const holding = holdings.get(tx.securityId) ?? { quantity: 0, costBasis: 0 };

        if (tx.category === INVESTMENT_TRANSACTION_CATEGORY.buy) {
          const newQuantity = holding.quantity + quantity;
          if (newQuantity <= 0) {
            holding.costBasis = 0;
          } else if (holding.quantity <= 0) {
            // Buy crosses from short/zero into long — only the long part is new basis.
            holding.costBasis = totalAmount * (newQuantity / quantity);
          } else {
            holding.costBasis += totalAmount;
          }
          holding.quantity = newQuantity;
        } else {
          if (holding.quantity > 0) {
            const newQuantity = holding.quantity - quantity;
            holding.costBasis = newQuantity <= 0 ? 0 : holding.costBasis * (newQuantity / holding.quantity);
          }
          holding.quantity -= quantity;
        }

        holdings.set(tx.securityId, holding);
      }

      prevValue = await valueHoldings(holdings, boundaryDate);
      prevDate = boundaryDate;
      if (prevValue > 0) started = true;
    }

    // `cumulativeFactor <= 0` means the position was wiped out — not annualizable.
    const computable = started && periodDays > 0 && cumulativeFactor > 0;
    const annualizedReturn = computable
      ? Math.round((Math.pow(cumulativeFactor, 365 / periodDays) - 1) * 100 * 100) / 100
      : null;

    results.push({
      portfolioId: portfolio.id,
      portfolioName: portfolio.name,
      annualizedReturn,
      hasEnoughHistory: annualizedReturn !== null,
      startDate,
      periodDays,
      currencyCode: baseCurrencyCode,
    });
  }

  return results;
};

export const getPortfoliosAnnualizedReturns = withTransaction(getPortfoliosAnnualizedReturnsImpl);
