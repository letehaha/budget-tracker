import { t } from '@i18n/index';
import { BadRequestError, ForbiddenError, NotFoundError } from '@js/errors';
import { logger } from '@js/utils/logger';
import axios, { AxiosInstance } from 'axios';

import { LunchFlowApiAccountsResponse, LunchFlowApiBalance, LunchFlowApiTransactionsResponse } from './types';

/**
 * LunchFlow API client
 * Handles all HTTP communication with LunchFlow's API
 *
 * API Documentation: https://docs.lunchflow.app/api-reference/introduction
 */
export class LunchFlowApiClient {
  private readonly baseURL = 'https://lunchflow.app/api/v1';
  private client: AxiosInstance;

  constructor(apiKey: string) {
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'x-api-key': apiKey,
      },
      timeout: 30000,
    });
  }

  /**
   * Test if the API key is valid by making a simple API call
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getAccounts();
      return true;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          return false;
        }
      }
      throw error;
    }
  }

  /**
   * GET /accounts - List all connected bank accounts
   */
  async getAccounts(): Promise<LunchFlowApiAccountsResponse> {
    try {
      const response = await this.client.get<LunchFlowApiAccountsResponse>('/accounts');
      return response.data;
    } catch (error) {
      this.handleApiError(error, 'getAccounts');
    }
  }

  /**
   * GET /accounts/:accountId/transactions - Get transactions for an account
   */
  async getTransactions({ accountId }: { accountId: number }): Promise<LunchFlowApiTransactionsResponse> {
    try {
      const response = await this.client.get<LunchFlowApiTransactionsResponse>(`/accounts/${accountId}/transactions`, {
        params: { include_pending: false },
      });
      return response.data;
    } catch (error) {
      this.handleApiError(error, 'getTransactions');
    }
  }

  /**
   * GET /accounts/:accountId/balance - Get balance for an account
   */
  async getBalance({ accountId }: { accountId: number }): Promise<LunchFlowApiBalance> {
    try {
      const response = await this.client.get<LunchFlowApiBalance>(`/accounts/${accountId}/balance`);
      return response.data;
    } catch (error) {
      this.handleApiError(error, 'getBalance');
    }
  }

  /**
   * Handle API errors with proper logging and throw appropriate custom errors
   */
  private handleApiError(error: unknown, method: string): never {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorMessage = error.response?.data?.message;

      logger.error({
        message: `[LunchFlowApiClient] ${method} failed: status=${status}, errorMessage=${errorMessage}`,
        error,
      });

      if (status === 401 || status === 403) {
        throw new ForbiddenError({
          message: errorMessage || t({ key: 'bankDataProviders.lunchflow.invalidApiKey' }),
        });
      } else if (status === 404) {
        throw new NotFoundError({
          message: errorMessage || t({ key: 'bankDataProviders.lunchflow.accountNotFound' }),
        });
      } else if (status && status >= 400) {
        throw new BadRequestError({
          message:
            errorMessage ||
            t({
              key: 'bankDataProviders.lunchflow.apiError',
              variables: { message: error.message },
            }),
        });
      }
    }

    logger.error({
      message: `[LunchFlowApiClient] ${method} unexpected error:`,
      error: error as Error,
    });
    throw error;
  }
}
