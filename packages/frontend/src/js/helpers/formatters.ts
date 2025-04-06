export const formatFiat = (value: unknown): string => Number(value).toFixed(2);

export function toLocalNumber(
  value: string | number | undefined | null,
  options: Intl.NumberFormatOptions & {
    locale?: Intl.LocalesArgument;
  } = {},
): string {
  if (value !== undefined && value !== null) {
    return Number(value).toLocaleString(options.locale ?? 'en-US', {
      ...options,
      maximumFractionDigits: options.maximumFractionDigits ?? 5,
      minimumFractionDigits: options.minimumFractionDigits ?? 2,
    });
  }
  return String(value);
}

function toLocalFiatCurrency(
  value: string | number | undefined | null,
  options: Intl.NumberFormatOptions = {},
): string {
  if (value !== undefined && value !== null) {
    return toLocalNumber(value, {
      ...options,
      minimumFractionDigits: options.minimumFractionDigits ?? 2,
      maximumFractionDigits: options.maximumFractionDigits ?? 2,
      currency: options.currency ?? 'USD',
      currencyDisplay: options.currencyDisplay ?? 'symbol',
      useGrouping: options.useGrouping ?? true,
      style: 'currency',
    });
  }
  return String(value);
}

/**
 * Format large numbers to be like:
 *
 * 1,000 - 9,999
 * 100,000 / 100k - 999,999 / 999.99k
 * 100,000,000 / 100m - 999,999,999 / 999.99m
 * @param {number} number - The number to format
 * @param {string} options.thousandSuffix - suffix for thousands
 * @param {string} options.millionSuffix - suffix for millions
 * @param {string} options.billionSuffix - suffix for billions
 * @param {number} options.maximumFractionDigits - maximum fraction digits
 * @param {number} options.minimumFractionDigits - minimum fraction digits
 * @param {number} options.thousandThreshold - threshold for thousands
 * @param {number} options.millionThreshold - threshold for millions
 * @param {number} options.billionThreshold - threshold for billions
 *
 * @param {boolean} options.isFiat - add fiat currency symbol and formatting
 * @param {string} options.currency - fiat currency symbol
 */
export function formatLargeNumber(
  value: number | string,
  options: Pick<Intl.NumberFormatOptions, 'maximumFractionDigits' | 'minimumFractionDigits' | 'currency'> & {
    millionSuffix?: string;
    thousandSuffix?: string;
    billionSuffix?: string;
    thousandThreshold?: number;
    millionThreshold?: number;
    billionThreshold?: number;
    // Solana lamports
    lamports?: boolean;
    isFiat?: boolean;
  } = {},
) {
  const suffixes = {
    millionSuffix: options.millionSuffix ?? 'M',
    thousandSuffix: options.thousandSuffix ?? 'k',
    billionSuffix: options.billionSuffix ?? 'B',
  };

  const thresholds = {
    thousandThreshold: options.thousandThreshold ?? 1_000,
    millionThreshold: options.millionThreshold ?? 1_000_000,
    billionThreshold: options.billionThreshold ?? 1_000_000_000,
  };

  let localNumber = Number(Math.floor(Number(value)));

  // Truncating floating numbers
  if (Number.isNaN(localNumber)) localNumber = 0;
  let delimiter = 1;
  let suffix = '';
  if (options.lamports) {
    localNumber /= 1_000_000_000;
  }
  const abs = Math.abs(localNumber);

  if (abs >= thresholds.billionThreshold) {
    delimiter = 1_000_000_000;
    suffix = suffixes.billionSuffix;
  } else if (abs >= thresholds.millionThreshold) {
    delimiter = 1_000_000;
    suffix = suffixes.millionSuffix;
  } else if (abs >= thresholds.thousandThreshold) {
    delimiter = 1_000;
    suffix = suffixes.thousandSuffix;
  }

  const formatterFunc = options.isFiat ? toLocalFiatCurrency : toLocalNumber;

  const formatted = formatterFunc(localNumber / delimiter, {
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    currency: options.currency,
  });
  return `${formatted}${suffix}`;
}

export function formatUIAmount(
  value: number,
  {
    currency,
  }: {
    currency?: Intl.NumberFormatOptions['currency'];
  } = {},
): string {
  if (value === Infinity || Number.isNaN(value)) return String(value);

  return toLocalFiatCurrency(value, { currency });
}
