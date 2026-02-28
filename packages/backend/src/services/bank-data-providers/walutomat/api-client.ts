import axios, { AxiosInstance } from 'axios';
import crypto from 'node:crypto';

// ============================================================================
// Types (subset of walutomat-sdk types needed for our integration)
// ============================================================================

export interface WalletBalance {
  currency: string;
  balanceTotal: string;
  balanceAvailable: string;
  balanceReserved: string;
}

export interface HistoryItem {
  historyItemId: number;
  transactionId: string;
  ts: string;
  operationAmount: string;
  balanceAfter: string;
  currency: string;
  operationType: string;
  operationDetailedType: string;
  operationDetails: Array<{ key: string; value: string }>;
}

interface GetHistoryParams {
  dateFrom?: string;
  dateTo?: string;
  currencies?: string[];
  operationType?: string;
  operationDetailedType?: string;
  itemLimit?: number;
  continueFrom?: number;
  sortOrder?: 'ASC' | 'DESC';
}

interface ApiResponse<T> {
  success: boolean;
  errors?: Array<{ key: string; description: string }>;
  result: T;
}

// ============================================================================
// Signing utilities (replicated from walutomat-sdk to avoid ESM dependency)
// ============================================================================

function getTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function signRequest({
  timestamp,
  endpointPath,
  bodyOrQuery,
  privateKey,
}: {
  timestamp: string;
  endpointPath: string;
  bodyOrQuery: string;
  privateKey: string;
}): string {
  const payload = timestamp + endpointPath + bodyOrQuery;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(payload);
  return signer.sign(privateKey, 'base64');
}

function buildQueryString(params: Record<string, unknown>): string {
  const entries: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      entries.push(`${encodeURIComponent(key)}=${encodeURIComponent(value.join(','))}`);
    } else {
      entries.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return entries.length > 0 ? `?${entries.join('&')}` : '';
}

// ============================================================================
// API Client
// ============================================================================

const BASE_URL = 'https://api.walutomat.pl';
const API_PATH = '/api/v2.0.0';

/**
 * Walutomat API client.
 * Handles RSA-SHA256 signed requests to the Walutomat API v2.
 */
export class WalutomatApiClient {
  private readonly apiKey: string;
  private readonly privateKey: string;
  private readonly client: AxiosInstance;

  constructor({ apiKey, privateKey }: { apiKey: string; privateKey: string }) {
    this.apiKey = apiKey;
    this.privateKey = privateKey;
    this.client = axios.create({
      baseURL: BASE_URL + API_PATH,
      timeout: 30000,
    });
  }

  /**
   * Test if the credentials are valid by making a simple API call.
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getBalances();
      return true;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          return false;
        }
      }
      // Signing errors (invalid key format) also mean invalid credentials
      if (error instanceof Error && error.message.includes('error:')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * GET /account/balances — Get all wallet balances.
   */
  async getBalances(): Promise<WalletBalance[]> {
    return this.signedGet<WalletBalance[]>('/account/balances');
  }

  /**
   * GET /account/history — Get wallet operation history.
   */
  async getHistory(params?: GetHistoryParams): Promise<HistoryItem[]> {
    const queryParams: Record<string, unknown> = {};

    if (params) {
      if (params.dateFrom) queryParams.dateFrom = params.dateFrom;
      if (params.dateTo) queryParams.dateTo = params.dateTo;
      if (params.currencies) queryParams.currencies = params.currencies;
      if (params.operationType) queryParams.operationType = params.operationType;
      if (params.operationDetailedType) queryParams.operationDetailedType = params.operationDetailedType;
      if (params.itemLimit) queryParams.itemLimit = params.itemLimit;
      if (params.continueFrom) queryParams.continueFrom = params.continueFrom;
      if (params.sortOrder) queryParams.sortOrder = params.sortOrder;
    }

    return this.signedGet<HistoryItem[]>('/account/history', queryParams);
  }

  /**
   * Async iterator that automatically paginates through all history items.
   */
  async *getHistoryIterator(params?: Omit<GetHistoryParams, 'continueFrom'>): AsyncIterableIterator<HistoryItem> {
    let continueFrom: number | undefined;

    while (true) {
      const items = await this.getHistory({
        ...params,
        continueFrom,
      });

      if (items.length === 0) break;

      for (const item of items) {
        yield item;
      }

      const lastItem = items[items.length - 1]!;
      continueFrom = lastItem.historyItemId;

      // If we got fewer items than the limit, we've reached the end
      if (items.length < (params?.itemLimit ?? 200)) break;
    }
  }

  // ============================================================================
  // Internal
  // ============================================================================

  private async signedGet<T>(endpoint: string, queryParams?: Record<string, unknown>): Promise<T> {
    const queryString = queryParams ? buildQueryString(queryParams) : '';
    // Signature must be computed over the FULL API path (including /api/v2.0.0 prefix)
    // with queryString appended to the path, and empty string as bodyOrQuery for GET requests
    const fullPath = API_PATH + endpoint + queryString;
    const timestamp = getTimestamp();
    const signature = signRequest({
      timestamp,
      endpointPath: fullPath,
      bodyOrQuery: '',
      privateKey: this.privateKey,
    });

    const response = await this.client.get<ApiResponse<T>>(endpoint + queryString, {
      headers: {
        'X-API-Key': this.apiKey,
        'X-API-Timestamp': timestamp,
        'X-API-Signature': signature,
      },
    });

    if (!response.data.success) {
      const errorDesc = response.data.errors?.[0]?.description ?? 'Unknown API error';
      throw new Error(`Walutomat API error: ${errorDesc}`);
    }

    return response.data.result;
  }
}
