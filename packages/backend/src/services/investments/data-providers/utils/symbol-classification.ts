/**
 * Pure helper functions for classifying symbols and determining
 * which data provider is best suited for different operations
 */
import { SECURITY_PROVIDER } from '@bt/shared/types';

type ExchangeRegion = 'US' | 'EU' | 'GLOBAL';

/**
 * Determines if a symbol is likely a US-traded security
 * US symbols are typically 1-5 letters, no special characters
 */
function isUSSymbol(symbol: string): boolean {
  const cleanSymbol = symbol.trim().toUpperCase();

  // US symbols are typically 1-5 letters, no special chars
  // Examples: AAPL, MSFT, GOOGL, BRK.A (some have dots)
  return /^[A-Z]{1,5}(\.[A-Z])?$/.test(cleanSymbol);
}

/**
 * Determines if a symbol is likely European-traded
 * European symbols often have extensions like .L, .PA, .DE
 */
function isEuropeanSymbol(symbol: string): boolean {
  const cleanSymbol = symbol.trim().toUpperCase();

  // Common European exchange suffixes
  const europeanSuffixes = ['.L', '.PA', '.DE', '.MI', '.AS', '.ASM', '.SW', '.ST', '.HE', '.OL', '.IC'];

  return europeanSuffixes.some((suffix) => cleanSymbol.endsWith(suffix));
}

/**
 * Gets the likely exchange region for a symbol
 */
function getExchangeRegion(symbol: string): ExchangeRegion {
  if (isUSSymbol(symbol)) {
    return 'US';
  }

  if (isEuropeanSymbol(symbol)) {
    return 'EU';
  }

  return 'GLOBAL';
}

/**
 * Gets provider preference for search operations
 */
export function getSearchProviderPreference(): {
  primary: SECURITY_PROVIDER;
  fallbacks: SECURITY_PROVIDER[];
} {
  // FMP has excellent global coverage for search
  return {
    primary: SECURITY_PROVIDER.fmp,
    fallbacks: [],
    // fallbacks: [SECURITY_PROVIDER.alphavantage, SECURITY_PROVIDER.polygon],
  };
}

/**
 * Gets provider preference for historical price operations
 */
export function getHistoricalPriceProviderPreference(symbol: string): {
  primary: SECURITY_PROVIDER;
  fallbacks: SECURITY_PROVIDER[];
} {
  const region = getExchangeRegion(symbol);

  if (region === 'US') {
    // Polygon is excellent for US stocks with good rate limits
    return {
      primary: SECURITY_PROVIDER.polygon,
      fallbacks: [SECURITY_PROVIDER.alphavantage],
    };
  }

  // For non-US stocks, AlphaVantage has broader coverage
  return {
    primary: SECURITY_PROVIDER.alphavantage,
    fallbacks: [],
  };
}

/**
 * Gets provider preference for latest price operations
 */
export function getLatestPriceProviderPreference(symbol: string): {
  primary: SECURITY_PROVIDER;
  fallbacks: SECURITY_PROVIDER[];
} {
  const region = getExchangeRegion(symbol);

  if (region === 'US') {
    // Polygon has good real-time data for US stocks
    return {
      primary: SECURITY_PROVIDER.polygon,
      fallbacks: [SECURITY_PROVIDER.fmp, SECURITY_PROVIDER.alphavantage],
    };
  }

  // For non-US, alphavantage has full coverage
  return {
    primary: SECURITY_PROVIDER.alphavantage,
    fallbacks: [SECURITY_PROVIDER.fmp, SECURITY_PROVIDER.polygon],
  };
}
