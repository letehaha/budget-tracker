export interface RefundLinkTotals {
  /** Sum of the selected transactions. Null when nothing is selected or a needed exchange rate is missing. */
  total: number | null;
  /** Currency `total` is expressed in: the shared tx currency, or the base currency for mixed selections. */
  currencyCode: string | null;
  /** True when `total` itself is an exchange-rate conversion (mixed-currency selection). */
  isTotalConverted: boolean;
  /** selected-total / original-amount, for the limit meter. Null when the sides can't be compared. */
  ratio: number | null;
  isOverLimit: boolean;
  /** True when the over-limit verdict is exact (same currency on both sides) rather than rate-converted. */
  isExactComparison: boolean;
}

const EMPTY_TOTALS: RefundLinkTotals = {
  total: null,
  currencyCode: null,
  isTotalConverted: false,
  ratio: null,
  isOverLimit: false,
  isExactComparison: false,
};

export const computeRefundLinkTotals = ({
  transactions,
  currentAmount,
  currentCurrencyCode,
  ratesMap,
  baseCurrencyCode,
}: {
  transactions: { amount: number; currencyCode: string }[];
  currentAmount?: number | null;
  currentCurrencyCode?: string;
  ratesMap: Record<string, { rate: number }>;
  baseCurrencyCode?: string;
}): RefundLinkTotals => {
  if (!transactions.length) return EMPTY_TOTALS;

  const toBase = (amount: number, code: string): number | null => {
    const rate = ratesMap[code];
    return rate ? amount * rate.rate : null;
  };

  const currencies = new Set(transactions.map((tx) => tx.currencyCode));
  const sharedCurrency = currencies.size === 1 ? transactions[0]!.currencyCode : null;

  let total: number | null;
  let currencyCode: string | null;
  let isTotalConverted = false;

  if (sharedCurrency) {
    total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
    currencyCode = sharedCurrency;
  } else {
    const converted = transactions.map((tx) => toBase(tx.amount, tx.currencyCode));
    if (converted.some((value) => value === null)) {
      total = null;
      currencyCode = null;
    } else {
      total = (converted as number[]).reduce((sum, value) => sum + value, 0);
      currencyCode = baseCurrencyCode ?? null;
      isTotalConverted = true;
    }
  }

  const limit = currentAmount && currentAmount > 0 ? currentAmount : null;
  const isExactComparison = Boolean(sharedCurrency && currentCurrencyCode && sharedCurrency === currentCurrencyCode);

  let ratio: number | null = null;
  let isOverLimit = false;

  if (limit && currentCurrencyCode && total !== null) {
    if (isExactComparison) {
      ratio = total / limit;
      isOverLimit = total > limit;
    } else {
      const totalInBase = sharedCurrency ? toBase(total, sharedCurrency) : total;
      const limitInBase = toBase(limit, currentCurrencyCode);
      if (totalInBase !== null && limitInBase !== null && limitInBase > 0) {
        ratio = totalInBase / limitInBase;
        isOverLimit = totalInBase > limitInBase;
      }
    }
  }

  return { total, currencyCode, isTotalConverted, ratio, isOverLimit, isExactComparison };
};
