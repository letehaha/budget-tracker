import { decryptToken } from '@common/utils/encryption';
import axios, { AxiosInstance } from 'axios';

const LUNCHFLOW_BASE_URL = 'https://lunchflow.app/api/v1';

export interface LunchFlowAccount {
  id: number;
  name: string;
  institution_name: string;
  institution_logo: string;
  provider: 'gocardless';
  status: 'ACTIVE' | 'INACTIVE';
}

export interface LunchFlowTransaction {
  id: string;
  accountId: number;
  amount: number;
  currency: string;
  date: string; // ISO date string
  merchant: string;
  description: string;
}

export interface LunchFlowBalance {
  amount: number;
  currency: string;
}

/**
 * Lunch Flow API Client
 * Handles communication with Lunch Flow REST API
 */
export class LunchFlowApiClient {
  private client: AxiosInstance;

  /**
   * @param encryptedApiKey - The encrypted API key (will be decrypted internally)
   */
  constructor(encryptedApiKey: string) {
    const apiKey = decryptToken(encryptedApiKey);

    this.client = axios.create({
      baseURL: LUNCHFLOW_BASE_URL,
      headers: {
        'x-api-key': apiKey,
      },
      timeout: 30000,
    });
  }

  /**
   * Get all connected bank accounts
   */
  async getAccounts(): Promise<{ accounts: LunchFlowAccount[]; total: number }> {
    const { data } = await this.client.get('/accounts');
    return data;
  }

  /**
   * Get transactions for a specific account
   */
  async getTransactions(accountId: number): Promise<{
    transactions: LunchFlowTransaction[];
    total: number;
  }> {
    const { data } = await this.client.get(`/accounts/${accountId}/transactions`);
    return data;
  }

  /**
   * Get balance for a specific account
   */
  async getBalance(accountId: number): Promise<{ balance: LunchFlowBalance }> {
    const { data } = await this.client.get(`/accounts/${accountId}/balance`);
    return data;
  }
}
