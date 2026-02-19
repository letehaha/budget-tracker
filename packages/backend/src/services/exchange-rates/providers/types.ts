/**
 * Core types and interfaces for the Exchange Rate Provider system.
 * This modular system allows easy addition/removal of currency rate data providers
 * with configurable priority for fallback behavior.
 */

// ============================================================================
// Provider Types and Enums
// ============================================================================

/**
 * Identifies the exchange rate provider type
 */
export enum EXCHANGE_RATE_PROVIDER_TYPE {
  CURRENCY_RATES_API = 'currency-rates-api',
  FRANKFURTER = 'frankfurter',
  API_LAYER = 'api-layer',
}

// ============================================================================
// Provider Configuration
// ============================================================================

/**
 * Metadata describing an exchange rate provider
 */
export interface ExchangeRateProviderMetadata {
  /** Provider type identifier */
  type: EXCHANGE_RATE_PROVIDER_TYPE;
  /** Display name for logging/UI */
  name: string;
  /** Short description of the provider */
  description: string;
  /** Priority for fallback order (lower = higher priority) */
  priority: number;
  /** List of supported currency codes (undefined = all currencies) */
  supportedCurrencies?: string[];
  /** Earliest date for which historical data is available (ISO date string) */
  minHistoricalDate?: string;
  /**
   * Whether this provider supports efficient historical data loading (time series API).
   * Providers with this set to true have a dedicated API endpoint for fetching
   * multiple dates at once, rather than making individual requests per day.
   */
  supportsHistoricalDataLoading?: boolean;
}

// ============================================================================
// Rate Data Types
// ============================================================================

/**
 * Parameters for fetching exchange rates
 */
export interface FetchRatesParams {
  /** The date to fetch rates for */
  date: Date;
  /** Base currency code (default: USD) */
  baseCurrency?: string;
  /** Target currencies to fetch (undefined = all available) */
  targetCurrencies?: string[];
}

/**
 * Parameters for fetching rates over a date range
 */
export interface FetchRatesRangeParams {
  /** Start date of the range */
  startDate: Date;
  /** End date of the range */
  endDate: Date;
  /** Base currency code (default: USD) */
  baseCurrency?: string;
  /** Target currencies to fetch (undefined = all available) */
  targetCurrencies?: string[];
}

/**
 * Exchange rate data for a single date
 */
export interface ExchangeRateResult {
  /** ISO date string (yyyy-MM-dd) */
  date: string;
  /** Base currency code */
  baseCurrency: string;
  /** Map of quote currency code to exchange rate */
  rates: Record<string, number>;
}

/**
 * Result from fetchRatesWithFallback including provider info
 */
export interface FetchRatesWithFallbackResult {
  /** The exchange rate data */
  result: ExchangeRateResult;
  /** Name of the provider that successfully fetched the rates */
  providerName: string;
  /** Type of the provider */
  providerType: EXCHANGE_RATE_PROVIDER_TYPE;
}

/**
 * Result from fetchHistoricalRatesWithFallback including provider info
 */
export interface FetchHistoricalRatesWithFallbackResult {
  /** Array of exchange rate results for the date range */
  results: ExchangeRateResult[];
  /** Name of the provider that successfully fetched the rates */
  providerName: string;
  /** Type of the provider */
  providerType: EXCHANGE_RATE_PROVIDER_TYPE;
}

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Interface that all exchange rate providers must implement.
 * Provides a consistent API for fetching rates from any data source.
 */
export interface IExchangeRateProvider {
  // ========================================
  // Metadata
  // ========================================

  /** Provider metadata (name, priority, supported currencies, etc.) */
  readonly metadata: ExchangeRateProviderMetadata;

  // ========================================
  // Availability
  // ========================================

  /**
   * Check if the provider is currently available.
   * This may check API connectivity, required credentials, etc.
   * @returns Promise<boolean> - true if provider can be used
   */
  isAvailable(): Promise<boolean>;

  // ========================================
  // Rate Fetching
  // ========================================

  /**
   * Fetch exchange rates for a specific date
   * @param params - Parameters including date and optional currency filters
   * @returns Exchange rate result or null if rates are unavailable
   */
  fetchRatesForDate(params: FetchRatesParams): Promise<ExchangeRateResult | null>;

  /**
   * Fetch exchange rates for a date range (optional)
   * Providers that don't support range fetching can omit this method.
   * @param params - Parameters including date range and optional currency filters
   * @returns Array of exchange rate results
   */
  fetchRatesForDateRange?(params: FetchRatesRangeParams): Promise<ExchangeRateResult[]>;

  /**
   * Get list of supported currencies (optional)
   * @returns Array of currency codes this provider supports
   */
  getSupportedCurrencies?(): Promise<string[]>;
}
