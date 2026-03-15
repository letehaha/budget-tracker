/**
 * LunchFlow-specific types for the provider implementation.
 * LunchFlow API returns monetary amounts as decimals (not cents).
 */
import type { Decimal } from '@bt/shared/types';

/**
 * LunchFlow API credentials required for authentication
 */
export interface LunchFlowCredentials {
  apiKey: string;
}

/**
 * LunchFlow connection metadata stored alongside credentials
 */
export interface LunchFlowMetadata {
  accountCount?: number;
  consecutiveAuthFailures?: number;
  deactivationReason?: 'auth_failure' | null;
}

/**
 * LunchFlow account status
 * @public
 */
export type LunchFlowAccountStatus = 'ACTIVE' | 'DISCONNECTED' | 'ERROR';

/**
 * LunchFlow API response: account
 * @public
 */
export interface LunchFlowApiAccount {
  id: number;
  name: string;
  institution_name: string;
  institution_logo: string | null;
  provider: string;
  currency?: string;
  status?: LunchFlowAccountStatus;
}

/**
 * LunchFlow API response: transaction
 */
export interface LunchFlowApiTransaction {
  id: string | null;
  accountId: number;
  amount: Decimal;
  currency: string;
  date: string;
  merchant?: string;
  description?: string;
  isPending?: boolean;
}

/**
 * LunchFlow API response: balance
 */
export interface LunchFlowApiBalance {
  balance: {
    amount: Decimal;
    currency: string;
  };
}

/**
 * LunchFlow API response: accounts list
 */
export interface LunchFlowApiAccountsResponse {
  accounts: LunchFlowApiAccount[];
  total: number;
}

/**
 * LunchFlow API response: transactions list
 */
export interface LunchFlowApiTransactionsResponse {
  transactions: LunchFlowApiTransaction[];
  total: number;
}
