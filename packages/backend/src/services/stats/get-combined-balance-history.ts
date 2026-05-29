import { ASSET_CLASS, INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { logger } from '@js/utils';
import ExchangeRates from '@models/exchange-rates.model';
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import Portfolios from '@models/investments/portfolios.model';
import Securities from '@models/investments/securities.model';
import SecurityPricing from '@models/investments/security-pricing.model';
import UserExchangeRates from '@models/user-exchange-rates.model';
import UsersCurrencies from '@models/users-currencies.model';
import VentureDeals from '@models/venture/venture-deals.model';
import { API_LAYER_BASE_CURRENCY_CODE } from '@services/exchange-rates/fetch-exchange-rates-for-date';
import { eachDayOfInterval, endOfDay, format, parseISO, startOfDay, subDays } from 'date-fns';
import { Op } from 'sequelize';

import { calculateVentureBalanceHistory } from './calculate-venture-balance-history';
import { getAggregatedBalanceHistory } from './get-balance-history';
import { getCreditLimitAdjustment } from './get-credit-limit-adjustment';

export interface CombinedBalanceHistoryItem {
  date: string;
  accountsBalance: number;
  portfoliosBalance: number;
  venturesBalance: number;
  totalBalance: number;
}

const formatDate = (date: Date | string): string => format(date, 'yyyy-MM-dd');

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

  const portfolioIds = portfolios.map((p: { id: string }) => p.id);

  type TransactionRow = Pick<
    InvestmentTransaction,
    'portfolioId' | 'securityId' | 'category' | 'date' | 'quantity' | 'refAmount' | 'refFees' | 'currencyCode'
  >;

  type HoldingState = {
    quantity: number;
    costBasis: number;
    currencyCode: string;
    assetClass: ASSET_CLASS;
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
  });

  const securityIds = [...new Set(transactions.map((t: TransactionRow) => t.securityId))];

  // Look up securities to get the *security's* native currency and asset class.
  // Transactions store the cash-leg currency (often the brokerage's settlement
  // currency, e.g. USD for an ASML.AS purchase), which is NOT the right currency
  // for converting market value — prices are in the security's native currency.
  type SecurityRow = Pick<Securities, 'id' | 'currencyCode' | 'assetClass'>;
  const securities: SecurityRow[] = await Securities.findAll({
    where: { id: { [Op.in]: securityIds } },
    attributes: ['id', 'currencyCode', 'assetClass'],
    raw: true,
  });
  const securitiesById = new Map(securities.map((s) => [s.id, s]));

  const currencyCodes = [...new Set(securities.map((s) => s.currencyCode))];

  if (securityIds.length === 0) {
    return null;
  }

  // Fetch data starting 7 days before minDate to ensure fallback lookups
  // have prior trading-day data available for weekends/holidays
  const dataFetchMinDate = format(subDays(parseISO(minDate), 7), 'yyyy-MM-dd');

  type SecurityPriceRow = Pick<SecurityPricing, 'securityId' | 'date' | 'priceClose'>;
  type ExchangeRateRow = Pick<UserExchangeRates, 'baseCode' | 'quoteCode' | 'date' | 'rate'>;

  // Currencies we need a `USD → X` rate for: every security currency PLUS the
  // user's base currency (used as the numerator in the cross-rate). USD itself
  // is excluded because `findLatestUsdRate` short-circuits to 1 for it.
  const usdRateQuoteCodes = [...new Set([userBaseCurrency.currencyCode, ...currencyCodes])].filter(
    (code) => code !== API_LAYER_BASE_CURRENCY_CODE,
  );

  const [securityPrices, userCustomExchangeRates, systemExchangeRates] = await Promise.all([
    SecurityPricing.findAll({
      where: {
        securityId: {
          [Op.in]: securityIds,
        },
        // `date` is now TIMESTAMPTZ (crypto stores intraday timestamps). A
        // raw `yyyy-MM-dd` upper bound would silently coerce to midnight UTC
        // and drop same-day intraday rows; explicit endOfDay keeps them.
        date: {
          [Op.between]: [startOfDay(parseISO(dataFetchMinDate)), endOfDay(parseISO(maxDate))],
        },
      },
      order: [
        ['securityId', 'ASC'],
        ['date', 'ASC'],
      ],
      attributes: ['securityId', 'date', 'priceClose'],
    }) as Promise<SecurityPriceRow[]>,
    UserExchangeRates.findAll({
      where: {
        userId,
        baseCode: {
          [Op.in]: currencyCodes,
        },
        quoteCode: userBaseCurrency.currencyCode,
        date: {
          [Op.between]: [dataFetchMinDate, maxDate],
        },
      },
      attributes: ['baseCode', 'quoteCode', 'date', 'rate'],
      raw: true,
    }) as Promise<ExchangeRateRow[]>,
    // System rates are stored only in one canonical direction:
    // `baseCode = API_LAYER_BASE_CURRENCY_CODE (USD), quoteCode = X` (1 USD = N X).
    // Query that direction for every currency we need to convert _from_ AND
    // for the user's base currency, then compute the actual security→base
    // cross-rate in `getExchangeRate` below. The cross-rate maths mirrors
    // `services/user-exchange-rate/get-exchange-rate.service.ts` — keep the
    // two implementations in sync if you touch either.
    ExchangeRates.findAll({
      where: {
        baseCode: API_LAYER_BASE_CURRENCY_CODE,
        quoteCode: { [Op.in]: usdRateQuoteCodes },
        date: {
          [Op.between]: [startOfDay(parseISO(dataFetchMinDate)), endOfDay(parseISO(maxDate))],
        },
      },
      order: [
        ['quoteCode', 'ASC'],
        ['date', 'ASC'],
      ],
      raw: true,
    }),
  ]);

  // Build price lookup with O(1) access by security+date. `price.date` is a
  // TIMESTAMPTZ Date (crypto carries intraday timestamps); format to
  // yyyy-MM-dd so the key matches `targetDate` strings below and same-day
  // intraday rows collapse onto the same daily bucket (last write wins).
  const pricesBySecurity = new Map<string, Array<{ date: string; price: number }>>();
  const pricesBySecurityAndDate = new Map<string, number>();
  for (const price of securityPrices) {
    const dateStr = formatDate(price.date);
    const priceValue = price.priceClose.toNumber();

    if (!pricesBySecurity.has(price.securityId)) {
      pricesBySecurity.set(price.securityId, []);
    }
    pricesBySecurity.get(price.securityId)!.push({
      date: dateStr,
      price: priceValue,
    });
    pricesBySecurityAndDate.set(`${price.securityId}_${dateStr}`, priceValue);
  }

  // User-set overrides — these are stored as `currencyCode → userBase` directly,
  // not via USD pivot, so they short-circuit the cross-rate maths below.
  const userRatesMap = new Map<string, number>();
  for (const r of userCustomExchangeRates) {
    userRatesMap.set(`${r.baseCode}_${formatDate(r.date)}`, r.rate);
  }

  // System rates indexed by `${quoteCode}_${dateStr}` — value is `1 USD = N quoteCode`.
  // Same currency can be queried under multiple cross-pairs so this stays a single
  // source of truth instead of one map per pair.
  const usdRatesMap = new Map<string, number>();
  // Per-currency sorted date list, ascending — used by `findLatestUsdRate` to walk
  // backwards from the requested date when an exact match is missing (weekends,
  // pre-historical-init dates).
  const usdRateDatesByQuote = new Map<string, string[]>();
  for (const rate of systemExchangeRates) {
    const dateStr = formatDate(rate.date);
    usdRatesMap.set(`${rate.quoteCode}_${dateStr}`, rate.rate);

    const dates = usdRateDatesByQuote.get(rate.quoteCode);
    if (dates) {
      dates.push(dateStr);
    } else {
      usdRateDatesByQuote.set(rate.quoteCode, [dateStr]);
    }
  }

  const missingRateCurrencies = new Set<string>();

  // Look up `1 USD = ? quoteCode` for `dateStr`, falling back to the most
  // recent prior rate if the exact day isn't present. Returns `null` if no
  // rate at all is known for this currency.
  const findLatestUsdRate = (quoteCode: string, dateStr: string): number | null => {
    if (quoteCode === API_LAYER_BASE_CURRENCY_CODE) return 1;

    const exact = usdRatesMap.get(`${quoteCode}_${dateStr}`);
    if (exact !== undefined) return exact;

    const dates = usdRateDatesByQuote.get(quoteCode);
    if (!dates || dates.length === 0) return null;

    let candidate: number | null = null;
    for (const d of dates) {
      if (d <= dateStr) {
        candidate = usdRatesMap.get(`${quoteCode}_${d}`) ?? candidate;
      } else {
        break;
      }
    }
    return candidate;
  };

  const getExchangeRate = (currencyCode: string, dateStr: string): number => {
    if (currencyCode === userBaseCurrency.currencyCode) {
      return 1;
    }

    // User override (`currencyCode → userBase`) wins over the computed cross-rate.
    const userOverride = userRatesMap.get(`${currencyCode}_${dateStr}`);
    if (userOverride !== undefined) return userOverride;

    // Cross-rate via USD pivot: value_in_userBase = value_in_currencyCode *
    // (USD→userBase) / (USD→currencyCode).
    const usdToCurrency = findLatestUsdRate(currencyCode, dateStr);
    const usdToBase = findLatestUsdRate(userBaseCurrency.currencyCode, dateStr);

    if (usdToCurrency == null || usdToBase == null) {
      missingRateCurrencies.add(currencyCode);
      return 1;
    }

    // A stored zero rate is data corruption, not a missing-rate gap — only a
    // bad DB write or an upstream provider bug can produce it. Surface it as
    // an error (not the missing-rate warn) and refuse to divide by zero.
    if (usdToCurrency === 0) {
      logger.error(`Stored exchange rate is zero for USD->${currencyCode} on ${dateStr}; treating as missing.`);
      missingRateCurrencies.add(currencyCode);
      return 1;
    }

    return usdToBase / usdToCurrency;
  };

  const findPriceForDate = (securityId: string, targetDate: string): number | null => {
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
  const transactionsByPortfolio = new Map<string, TransactionRow[]>();
  for (const tx of transactions) {
    if (!transactionsByPortfolio.has(tx.portfolioId)) {
      transactionsByPortfolio.set(tx.portfolioId, []);
    }
    transactionsByPortfolio.get(tx.portfolioId)!.push(tx);
  }

  const portfolioValuesByDate = new Map<string, number>();

  // Process all portfolios, building up holdings state incrementally by date.
  // Holdings tracking must mirror `recalculateHolding` (see
  // services/investments/holdings/recalculation.service.ts) — otherwise an
  // oversell mid-history (allowed for crypto drift) causes the holding to be
  // dropped and reinflated by the next buy, ballooning quantity and market value.
  for (const dateStr of uniqueDates) {
    let totalValueForDate = 0;

    for (const portfolioId of portfolioIds) {
      const portfolioTxs = transactionsByPortfolio.get(portfolioId) ?? [];

      const holdings = new Map<string, HoldingState>();

      for (const tx of portfolioTxs) {
        // Transactions are sorted by date ASC; stop once we pass the snapshot.
        if (tx.date > dateStr) break;

        const securityId = tx.securityId;
        const quantity = tx.quantity.toNumber();
        const totalAmount = tx.refAmount.toNumber() + tx.refFees.toNumber();

        if (!holdings.has(securityId)) {
          const security = securitiesById.get(securityId);
          holdings.set(securityId, {
            quantity: 0,
            costBasis: 0,
            currencyCode: security?.currencyCode ?? tx.currencyCode,
            assetClass: security?.assetClass ?? ASSET_CLASS.other,
          });
        }

        const holding = holdings.get(securityId)!;

        if (tx.category === INVESTMENT_TRANSACTION_CATEGORY.buy) {
          const newQuantity = holding.quantity + quantity;
          if (newQuantity <= 0) {
            holding.costBasis = 0;
          } else if (holding.quantity <= 0) {
            // Buy crosses from short/zero into long — only the long portion is new basis.
            const longProportion = newQuantity / quantity;
            holding.costBasis = totalAmount * longProportion;
          } else {
            holding.costBasis += totalAmount;
          }
          holding.quantity = newQuantity;
        } else if (tx.category === INVESTMENT_TRANSACTION_CATEGORY.sell) {
          if (holding.quantity > 0) {
            const newQuantity = holding.quantity - quantity;
            if (newQuantity <= 0) {
              holding.costBasis = 0;
            } else {
              const remainingProportion = newQuantity / holding.quantity;
              holding.costBasis *= remainingProportion;
            }
          }
          holding.quantity -= quantity;
        }
      }

      for (const [securityId, holding] of holdings) {
        // Stocks cap at zero; crypto can legitimately drift negative until reconciled.
        const allowNegative = holding.assetClass === ASSET_CLASS.crypto;
        const effectiveQuantity = !allowNegative && holding.quantity < 0 ? 0 : holding.quantity;
        if (effectiveQuantity === 0) continue;

        const currentPrice = findPriceForDate(securityId, dateStr);

        if (currentPrice !== null) {
          const marketValueInSecurityCurrency = effectiveQuantity * currentPrice;
          const exchangeRate = getExchangeRate(holding.currencyCode, dateStr);
          const marketValueInBaseCurrency = Math.floor(marketValueInSecurityCurrency * exchangeRate);
          totalValueForDate += marketValueInBaseCurrency;
        } else {
          totalValueForDate += holding.costBasis;
        }
      }
    }

    portfolioValuesByDate.set(dateStr, Money.fromDecimal(totalValueForDate).toCents());
  }

  if (missingRateCurrencies.size > 0) {
    logger.warn('Exchange rate fallback to 1:1', {
      userId,
      baseCurrency: userBaseCurrency.currencyCode,
      currencies: Array.from(missingRateCurrencies),
      dateRange: { from: minDate, to: maxDate },
    });
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
  includeCreditLimit = false,
}: {
  userId: number;
  from?: string;
  to?: string;
  includeCreditLimit?: boolean;
}): Promise<CombinedBalanceHistoryItem[]> => {
  try {
    // Handle optional from/to parameters
    // If 'to' is not provided, use today
    const maxDate = to || format(new Date(), 'yyyy-MM-dd');

    // If 'from' is not provided, try to get the earliest investment transaction date
    let minDate = from;
    if (!minDate) {
      const [oldestTransaction, oldestDeal] = await Promise.all([
        InvestmentTransaction.findOne({
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
        }),
        VentureDeals.findOne({
          where: { userId },
          order: [['investmentDate', 'ASC']],
          attributes: ['investmentDate'],
          raw: true,
        }),
      ]);

      const candidates: string[] = [];
      if (oldestTransaction?.date) candidates.push(format(new Date(oldestTransaction.date), 'yyyy-MM-dd'));
      if (oldestDeal?.investmentDate) candidates.push(oldestDeal.investmentDate);
      candidates.sort();
      minDate = candidates[0] ?? maxDate;
    }

    const uniqueDates = eachDayOfInterval({
      start: parseISO(minDate),
      end: parseISO(maxDate),
    }).map((date) => format(date, 'yyyy-MM-dd'));

    const [accountsBalanceHistory, portfolioValuesByDate, ventureValuesByDate, creditLimitSum] = await Promise.all([
      getAggregatedBalanceHistory({ userId, from: minDate, to: maxDate }),
      calculatePortfolioBalanceHistory({ userId, minDate, maxDate, uniqueDates }),
      calculateVentureBalanceHistory({ userId, minDate, maxDate, uniqueDates }),
      includeCreditLimit ? getCreditLimitAdjustment({ userId }) : Promise.resolve(0),
    ]);

    // If no data at all, return empty array
    if (
      (!accountsBalanceHistory || accountsBalanceHistory.length === 0) &&
      (!portfolioValuesByDate || portfolioValuesByDate.size === 0) &&
      (!ventureValuesByDate || ventureValuesByDate.size === 0)
    ) {
      return [];
    }

    // Build Map for O(1) lookup instead of O(n) find
    const accountsBalanceByDate = new Map<string, number>();
    for (const item of accountsBalanceHistory) {
      accountsBalanceByDate.set(item.date, item.amount);
    }

    // Combine accounts, portfolio, and venture balances with O(1) lookups
    const combinedHistory: CombinedBalanceHistoryItem[] = uniqueDates.map((dateStr) => {
      const accountsBalance = (accountsBalanceByDate.get(dateStr) ?? 0) - creditLimitSum;
      const portfoliosBalance = portfolioValuesByDate?.get(dateStr) ?? 0;
      const venturesBalance = ventureValuesByDate?.get(dateStr) ?? 0;

      return {
        date: dateStr,
        accountsBalance,
        portfoliosBalance,
        venturesBalance,
        totalBalance: accountsBalance + portfoliosBalance + venturesBalance,
      };
    });

    return combinedHistory;
  } catch (err) {
    console.error('Error getting optimized combined balance history:', err);
    throw err;
  }
};
