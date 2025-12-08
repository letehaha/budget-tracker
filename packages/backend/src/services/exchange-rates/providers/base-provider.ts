/**
 * Base class for exchange rate providers.
 * Provides common functionality and enforces the provider interface.
 */
import { logger } from '@js/utils';
import { format, startOfDay } from 'date-fns';

import {
  ExchangeRateProviderMetadata,
  ExchangeRateResult,
  FetchRatesParams,
  FetchRatesRangeParams,
  IExchangeRateProvider,
} from './types';

/**
 * Default base currency used by all providers
 */
export const DEFAULT_BASE_CURRENCY = 'USD';

/**
 * Standard date format for exchange rates
 */
export const EXCHANGE_RATE_DATE_FORMAT = 'yyyy-MM-dd';

/**
 * Abstract base class for exchange rate providers.
 * Subclasses must implement core methods while inheriting common utilities.
 */
export abstract class BaseExchangeRateProvider implements IExchangeRateProvider {
  abstract readonly metadata: ExchangeRateProviderMetadata;

  // ========================================
  // Abstract Methods (must be implemented)
  // ========================================

  /**
   * Check if the provider is currently available
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * Fetch exchange rates for a specific date
   */
  abstract fetchRatesForDate(params: FetchRatesParams): Promise<ExchangeRateResult | null>;

  // ========================================
  // Optional Methods (can be overridden)
  // ========================================

  /**
   * Fetch exchange rates for a date range
   * Default implementation calls fetchRatesForDate for each day
   */
  async fetchRatesForDateRange(params: FetchRatesRangeParams): Promise<ExchangeRateResult[]> {
    const results: ExchangeRateResult[] = [];
    const currentDate = new Date(params.startDate);
    const endDate = new Date(params.endDate);

    while (currentDate <= endDate) {
      const result = await this.fetchRatesForDate({
        date: new Date(currentDate),
        baseCurrency: params.baseCurrency,
        targetCurrencies: params.targetCurrencies,
      });

      if (result) {
        results.push(result);
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return results;
  }

  /**
   * Get list of supported currencies
   * Default returns metadata.supportedCurrencies if defined
   */
  async getSupportedCurrencies(): Promise<string[]> {
    return this.metadata.supportedCurrencies || [];
  }

  // ========================================
  // Utility Methods
  // ========================================

  /**
   * Get the provider name for logging
   */
  protected get providerName(): string {
    return this.metadata.name;
  }

  /**
   * Get the provider type
   */
  protected get providerType(): string {
    return this.metadata.type;
  }

  /**
   * Normalize a date to start of day
   */
  protected normalizeDate(date: Date): Date {
    return startOfDay(date);
  }

  /**
   * Format a date for API requests
   */
  protected formatDate(date: Date): string {
    return format(this.normalizeDate(date), EXCHANGE_RATE_DATE_FORMAT);
  }

  /**
   * Log an info message with provider context
   */
  protected logInfo(message: string, context?: Record<string, unknown>): void {
    logger.info(`[${this.providerName}] ${message}`, context);
  }

  /**
   * Log a warning message with provider context
   */
  protected logWarn(message: string, context?: Record<string, unknown>): void {
    logger.warn(`[${this.providerName}] ${message}`, context);
  }

  /**
   * Log an error message with provider context
   */
  protected logError(message: string, context?: Record<string, unknown>): void {
    logger.error(`[${this.providerName}] ${message}`, context);
  }

  /**
   * Get the base currency to use (defaults to USD)
   */
  protected getBaseCurrency(params: FetchRatesParams | FetchRatesRangeParams): string {
    return params.baseCurrency || DEFAULT_BASE_CURRENCY;
  }

  /**
   * Filter rates by target currencies if specified
   */
  protected filterRatesByCurrencies({
    rates,
    targetCurrencies,
  }: {
    rates: Record<string, number>;
    targetCurrencies?: string[];
  }): Record<string, number> {
    if (!targetCurrencies || targetCurrencies.length === 0) {
      return rates;
    }

    const filtered: Record<string, number> = {};
    for (const currency of targetCurrencies) {
      if (rates[currency] !== undefined) {
        filtered[currency] = rates[currency];
      }
    }
    return filtered;
  }
}
