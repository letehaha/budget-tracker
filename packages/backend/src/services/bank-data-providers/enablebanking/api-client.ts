/**
 * Enable Banking API client
 * Handles all HTTP communication with Enable Banking's API
 *
 * API Documentation: https://enablebanking.com/docs/api/reference
 */
import { t } from '@i18n/index';
import { BadGateway, BadRequestError, ForbiddenError, ValidationError } from '@js/errors';
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

/**
 * JSON.stringify that swallows circular-reference errors so logging never
 * masks the original API failure.
 */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Detect when an Enable Banking ASPSP_ERROR (HTTP 400) actually represents an
 * upstream session/token/consent failure. Matches on either:
 *   - nested HTTP code/status of 401 or 403 (string "403 FORBIDDEN" or numeric)
 *   - keywords in the wrapper or nested message indicating expired/invalid auth
 *
 * Promoting these to ForbiddenError lets the existing handleProviderError flow
 * deactivate the connection and surface a "reconnect" prompt to the user.
 */
function isAspspAuthFailure({
  detail,
  aspspMessage,
}: {
  detail: Record<string, unknown>;
  aspspMessage?: string;
}): boolean {
  const errorData = (detail.error_data ?? {}) as Record<string, unknown>;

  const nestedCode = errorData.code;
  if (typeof nestedCode === 'string' && /^\s*(401|403)\b/.test(nestedCode)) return true;
  if (typeof nestedCode === 'number' && (nestedCode === 401 || nestedCode === 403)) return true;

  const nestedStatus = errorData.status;
  if (typeof nestedStatus === 'number' && (nestedStatus === 401 || nestedStatus === 403)) return true;

  const nestedMessage = typeof errorData.message === 'string' ? errorData.message : '';
  const combined = `${aspspMessage ?? ''} ${nestedMessage}`.toLowerCase();
  // "forbidden" / "access ... not allowed" cover the case where Enable Banking
  // strips the upstream error_data (seen in dev) but keeps the wrapper message
  // "Forbidden, authenticated but access to resource is not allowed".
  return /refresh.?token|token.*(expired|invalid)|session.*(expired|invalid)|consent.*(expired|invalid|revoked)|reauthorization|unauthorized|\bforbidden\b|access.*not allowed/.test(
    combined,
  );
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
      const data = (error.response?.data ?? {}) as Record<string, unknown>;
      const httpUrl = error.config?.url;
      const httpMethod = error.config?.method?.toUpperCase();

      // Enable Banking wraps upstream bank failures as HTTP 400 with
      // `error: "ASPSP_ERROR"` and nests the real payload in `detail.error_data`.
      // Flatten those fields to top-level primitives so Sentry's default
      // `normalizeDepth: 3` doesn't truncate them to "[Object]".
      const detail = (data.detail ?? {}) as Record<string, unknown>;
      const aspspError = typeof data.error === 'string' ? data.error : undefined;
      const aspspMessage = typeof detail.message === 'string' ? detail.message : undefined;
      const aspspErrorName = typeof detail.error_name === 'string' ? detail.error_name : undefined;
      const aspspErrorDataStr =
        detail.error_data != null
          ? typeof detail.error_data === 'string'
            ? detail.error_data
            : safeStringify(detail.error_data)
          : undefined;

      // Prefer real upstream message over the generic wrapper "Error interacting with ASPSP".
      const message = aspspMessage || (typeof data.message === 'string' ? data.message : error.message);

      const errorContext = {
        status,
        httpMethod,
        httpUrl,
        message,
        aspspError,
        aspspErrorName,
        aspspMessage,
        aspspErrorDataStr,
        rawData: safeStringify(data),
      };
      const errorDetails = { aspspError, aspspErrorName, aspspMessage, aspspErrorDataStr };

      logger.error(`[EnableBankingApiClient] ${method} failed:`, errorContext);

      // Detect ASPSP-wrapped session/token expiry. Upstream returns 401/403 but
      // Enable Banking surfaces it as 400 ASPSP_ERROR — promote to ForbiddenError
      // so the provider's handleProviderError marks the connection inactive and
      // the UI prompts the user to reconnect.
      if (status === 400 && aspspError === 'ASPSP_ERROR' && isAspspAuthFailure({ detail, aspspMessage })) {
        throw new ForbiddenError({
          message: t({ key: 'bankDataProviders.enableBanking.sessionExpiredReconnect' }),
          details: errorDetails,
        });
      }

      if (status === 401 || status === 403) {
        throw new ForbiddenError({
          message: t({ key: 'bankDataProviders.enableBanking.authenticationFailed', variables: { message } }),
          details: errorDetails,
        });
      }

      if (status && status >= 400 && status < 500) {
        throw new BadRequestError({
          message: t({ key: 'bankDataProviders.enableBanking.apiBadRequestError', variables: { message } }),
          details: errorDetails,
        });
      }

      throw new BadGateway({
        message: t({ key: 'bankDataProviders.enableBanking.apiGeneralError', variables: { message } }),
        details: errorDetails,
      });
    }

    throw error;
  }

  /**
   * Test connection by fetching application info.
   * Returns false only for a genuine auth failure (401/403). Network/5xx errors
   * propagate via handleApiError so callers can distinguish "invalid creds" from
   * "provider is down".
   * @link https://enablebanking.com/docs/api/reference#application-get
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.get('/application', {
        headers: this.getAuthHeaders(),
      });
      return true;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          return false;
        }
      }
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
      // User-side misconfig: their Enable Banking app's redirect URL allowlist
      // doesn't include the URL we sent. Surface as a validation error so it
      // reaches the user instead of crashing into Sentry.
      if (axios.isAxiosError(error) && error.response?.data?.error === 'REDIRECT_URI_NOT_ALLOWED') {
        throw new ValidationError({
          message: t({
            key: 'bankDataProviders.enableBanking.redirectUriNotAllowed',
            variables: { redirectUrl: request.redirect_url },
          }),
        });
      }
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
