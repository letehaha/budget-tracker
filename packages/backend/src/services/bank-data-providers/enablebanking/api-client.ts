/**
 * Enable Banking API client
 * Handles all HTTP communication with Enable Banking's API
 *
 * API Documentation: https://enablebanking.com/docs/api/reference
 */
import { BadRequestError, ForbiddenError } from '@js/errors';
import { logger } from '@js/utils/logger';
import axios, { AxiosInstance } from 'axios';

import { generateJWT } from './jwt-utils';
import {
  ASPSP,
  ASPSPsResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  EnableBankingAccount,
  EnableBankingBalance,
  EnableBankingCredentials,
  SessionDetails,
  StartAuthorizationRequest,
  StartAuthorizationResponse,
  TransactionsQuery,
  TransactionsResponse,
} from './types';

/**
 * PSU (Payment Service User) context headers
 * Required for certain operations to comply with PSD2
 */
interface PSUContext {
  /** PSU IP address */
  ipAddress?: string;
  /** PSU user agent */
  userAgent?: string;
}

export class EnableBankingApiClient {
  private readonly baseURL = 'https://api.enablebanking.com';
  private client: AxiosInstance;
  private credentials: EnableBankingCredentials;

  constructor(credentials: EnableBankingCredentials) {
    this.credentials = credentials;
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000, // 30 seconds
    });
  }

  /**
   * Generate JWT token for authentication
   * Tokens are valid for 1 hour by default
   */
  private generateAuthToken(): string {
    return generateJWT(this.credentials.appId, this.credentials.privateKey, 3600);
  }

  /**
   * Get authorization headers with JWT token
   */
  private getAuthHeaders(psuContext?: PSUContext): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.generateAuthToken()}`,
      'Content-Type': 'application/json',
    };

    // Add PSU context headers if provided
    if (psuContext?.ipAddress) {
      headers['psu-ip-address'] = psuContext.ipAddress;
    }
    if (psuContext?.userAgent) {
      headers['psu-user-agent'] = psuContext.userAgent;
    }

    return headers;
  }

  /**
   * Handle API errors and convert to appropriate error types
   */
  private handleApiError(error: unknown, method: string): never {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;

      logger.error(`[EnableBankingApiClient] ${method} failed:`, {
        status,
        message,
        data: error.response?.data,
      });

      if (status === 401 || status === 403) {
        throw new ForbiddenError({ message: `Enable Banking authentication failed: ${message}` });
      }

      if (status && status >= 400 && status < 500) {
        throw new BadRequestError({ message: `Enable Banking API error: ${message}` });
      }

      throw new Error(`Enable Banking API error: ${message}`);
    }

    throw error;
  }

  /**
   * Test connection by fetching application info
   * @link https://enablebanking.com/docs/api/reference#application-get
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.get('/application', {
        headers: this.getAuthHeaders(),
      });
      return true;
    } catch (error) {
      this.handleApiError(error, 'testConnection');
    }
  }

  /**
   * Get list of all supported ASPSPs (banks)
   * Returns full bank information including auth methods, payment support, etc.
   * @link https://enablebanking.com/docs/api/reference#aspsps-get
   */
  async getASPSPs(): Promise<ASPSP[]> {
    try {
      const response = await this.client.get<ASPSPsResponse>('/aspsps', {
        headers: this.getAuthHeaders(),
      });
      return response.data.aspsps;
    } catch (error) {
      this.handleApiError(error, 'getASPSPs');
    }
  }

  /**
   * Start authorization flow
   * Returns URL for user to authorize access
   * @link https://enablebanking.com/docs/api/reference#auth-post
   */
  async startAuthorization(
    request: StartAuthorizationRequest,
    psuContext?: PSUContext,
  ): Promise<StartAuthorizationResponse> {
    try {
      const response = await this.client.post<StartAuthorizationResponse>('/auth', request, {
        headers: this.getAuthHeaders(psuContext),
      });
      return response.data;
    } catch (error) {
      this.handleApiError(error, 'startAuthorization');
    }
  }

  /**
   * Create session from authorization code
   * @link https://enablebanking.com/docs/api/reference#sessions-post
   */
  async createSession(request: CreateSessionRequest, psuContext?: PSUContext): Promise<CreateSessionResponse> {
    try {
      const response = await this.client.post<CreateSessionResponse>('/sessions', request, {
        headers: this.getAuthHeaders(psuContext),
      });
      return response.data;
    } catch (error) {
      this.handleApiError(error, 'createSession');
    }
  }

  /**
   * Get session details
   * @link https://enablebanking.com/docs/api/reference#sessions-sessionid-get
   */
  async getSession(sessionId: string): Promise<SessionDetails> {
    try {
      const response = await this.client.get<SessionDetails>(`/sessions/${sessionId}`, {
        headers: this.getAuthHeaders(),
      });
      return response.data;
    } catch (error) {
      this.handleApiError(error, 'getSession');
    }
  }

  /**
   * Delete session (revoke consent)
   * @link https://enablebanking.com/docs/api/reference#sessions-sessionid-delete
   */
  async deleteSession(sessionId: string, psuContext?: PSUContext): Promise<void> {
    try {
      await this.client.delete(`/sessions/${sessionId}`, {
        headers: this.getAuthHeaders(psuContext),
      });
    } catch (error) {
      this.handleApiError(error, 'deleteSession');
    }
  }

  /**
   * Get account details
   * @link https://enablebanking.com/docs/api/reference#accounts-accountid-details-get
   */
  async getAccountDetails(accountId: string): Promise<EnableBankingAccount> {
    try {
      const response = await this.client.get<EnableBankingAccount>(`/accounts/${accountId}/details`, {
        headers: this.getAuthHeaders(),
      });
      return response.data;
    } catch (error) {
      this.handleApiError(error, 'getAccountDetails');
    }
  }

  /**
   * Get account balances
   * @link https://enablebanking.com/docs/api/reference#accounts-accountid-balances-get
   */
  async getAccountBalances(accountId: string, psuContext?: PSUContext): Promise<EnableBankingBalance[]> {
    try {
      const response = await this.client.get<{ balances: EnableBankingBalance[] }>(`/accounts/${accountId}/balances`, {
        headers: this.getAuthHeaders(psuContext),
      });
      return response.data.balances;
    } catch (error) {
      this.handleApiError(error, 'getAccountBalances');
    }
  }

  /**
   * Get account transactions with pagination support
   * @link https://enablebanking.com/docs/api/reference#accounts-accountid-transactions-get
   */
  async getAccountTransactions(
    accountId: string,
    query?: TransactionsQuery,
    psuContext?: PSUContext,
  ): Promise<TransactionsResponse> {
    try {
      const response = await this.client.get<TransactionsResponse>(`/accounts/${accountId}/transactions`, {
        headers: this.getAuthHeaders(psuContext),
        params: query,
      });
      return response.data;
    } catch (error) {
      this.handleApiError(error, 'getAccountTransactions');
    }
  }

  /**
   * Fetch all transactions with automatic pagination
   * Continues fetching until no more continuation_key is returned
   */
  async getAllTransactions(
    accountId: string,
    query?: Omit<TransactionsQuery, 'continuation_key'>,
    psuContext?: PSUContext,
  ): Promise<TransactionsResponse['transactions']> {
    const allTransactions: TransactionsResponse['transactions'] = [];
    let continuationKey: string | undefined;

    do {
      const response = await this.getAccountTransactions(
        accountId,
        {
          ...query,
          continuation_key: continuationKey,
        },
        psuContext,
      );

      allTransactions.push(...response.transactions);
      continuationKey = response.continuation_key;
    } while (continuationKey);

    return allTransactions;
  }
}
