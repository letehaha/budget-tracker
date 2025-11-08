import {
  ExternalMonobankClientInfoResponse,
  ExternalMonobankTransactionResponse,
} from '@bt/shared/types/external-services';
import { BadRequestError, ForbiddenError, TooManyRequests } from '@js/errors';
import { CacheClient } from '@js/utils/cache';
import { logger } from '@js/utils/logger';
import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';

/**
 * Monobank API client
 * Handles all HTTP communication with Monobank's API
 *
 * API Documentation: https://api.monobank.ua/docs/
 */
export class MonobankApiClient {
  private readonly baseURL = 'https://api.monobank.ua';
  private client: AxiosInstance;
  private apiToken: string;
  private cache: CacheClient<ExternalMonobankClientInfoResponse>;
  private tokenHash: string;

  constructor(apiToken: string) {
    this.apiToken = apiToken;
    // Create a hash of the token for cache key (don't store raw token in cache keys)
    this.tokenHash = crypto.createHash('sha256').update(apiToken).digest('hex').slice(0, 16);
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'X-Token': this.apiToken,
      },
      timeout: 30000, // 30 seconds
    });
    // Cache client info for 15 minutes (900 seconds)
    this.cache = new CacheClient<ExternalMonobankClientInfoResponse>({
      ttl: 900,
      logPrefix: 'MonobankClientInfo',
    });
  }

  /**
   * Get client information and accounts (cached version)
   * Rate limit: once per 60 seconds
   * Cache: 15 minutes
   *
   * @param bypassCache - If true, skip cache and fetch fresh data
   * @returns Client info with accounts
   * @link https://api.monobank.ua/docs/#tag/Kliyentski-personalni-dani/paths/~1personal~1client-info/get
   */
  async getClientInfo({
    bypassCache = false,
  }: { bypassCache?: boolean } = {}): Promise<ExternalMonobankClientInfoResponse> {
    const cacheKey = `monobank:client-info:${this.tokenHash}`;

    // Try to get from cache first (unless bypassing cache)
    if (!bypassCache) {
      const cached = await this.cache.read(cacheKey);
      if (cached) {
        logger.info('[MonobankApiClient] Returning cached client info');
        return cached;
      }
    }

    // Fetch fresh data
    try {
      const response = await this.client.get<ExternalMonobankClientInfoResponse>('/personal/client-info');

      // Store in cache
      await this.cache.write({ key: cacheKey, value: response.data });

      return response.data;
    } catch (error) {
      this.handleApiError(error, 'getClientInfo');
      throw error;
    }
  }

  /**
   * Get account statement (transactions) for a specific account
   * Rate limit: once per 60 seconds
   *
   * @param accountId - Account ID from Monobank
   * @param from - Start timestamp (Unix seconds)
   * @param to - End timestamp (Unix seconds)
   * @returns Array of transactions
   * @link https://api.monobank.ua/docs/#tag/Kliyentski-personalni-dani/paths/~1personal~1statement~1{account}~1{from}~1{to}/get
   */
  async getStatement(accountId: string, from: number, to: number): Promise<ExternalMonobankTransactionResponse[]> {
    try {
      const response = await this.client.get<ExternalMonobankTransactionResponse[]>(
        `/personal/statement/${accountId}/${from}/${to}`,
      );
      return response.data;
    } catch (error) {
      this.handleApiError(error, 'getStatement');
      throw error;
    }
  }

  /**
   * Set webhook URL for real-time transaction notifications
   * Rate limit: once per 60 seconds
   *
   * @param webhookUrl - URL to receive webhook notifications
   * @link https://api.monobank.ua/docs/#tag/Kliyentski-personalni-dani/paths/~1personal~1webhook/post
   */
  async setWebhook(webhookUrl: string): Promise<void> {
    try {
      await this.client.post('/personal/webhook', { webHookUrl: webhookUrl });
    } catch (error) {
      this.handleApiError(error, 'setWebhook');
      throw error;
    }
  }

  /**
   * Handle API errors with proper logging and throw appropriate custom errors
   * @param error - Error object from axios
   * @param method - API method name for logging
   */
  private handleApiError(error: unknown, method: string): never {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorDescription = error.response?.data?.errorDescription;

      logger.error(`[MonobankApiClient] ${method} failed:`, {
        status,
        errorDescription,
        message: error.message,
      });

      // Handle specific error cases with proper error types
      if (errorDescription === "Unknown 'X-Token'") {
        logger.warn(`[MonobankApiClient] Invalid API token used in ${method}`);
        throw new ForbiddenError({ message: 'Invalid Monobank API token' });
      } else if (status === 429) {
        logger.warn(`[MonobankApiClient] Rate limit exceeded in ${method}`);
        throw new TooManyRequests({
          message: 'Monobank API rate limit exceeded. Please try again in a minute.',
          details: { provider: 'monobank' },
        });
      } else if (status && status >= 400) {
        throw new BadRequestError({
          message: errorDescription || `Monobank API error: ${error.message}`,
        });
      }
    }

    logger.error({ message: `[MonobankApiClient] ${method} unexpected error:`, error: error as Error });
    throw error;
  }

  /**
   * Test if the API token is valid by making a simple API call
   * @returns True if token is valid, false otherwise
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getClientInfo();
      return true;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorDescription = error.response?.data?.errorDescription;
        if (errorDescription === "Unknown 'X-Token'") {
          return false;
        }
      }
      // For other errors (network, timeout, etc.), rethrow
      throw error;
    }
  }
}
