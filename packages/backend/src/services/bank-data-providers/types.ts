/**
 * Core types and interfaces for the Bank Data Provider system.
 * This system allows users to connect multiple bank accounts from various providers
 * (Monobank, Enable Banking, etc.) in a unified, modular way.
 */
import { BANK_PROVIDER_TYPE, Cents } from '@bt/shared/types';

// ============================================================================
// Provider Types and Enums
// ============================================================================

/**
 * Feature capabilities of a provider
 */
interface ProviderFeatures {
  /** Provider supports webhook notifications */
  supportsWebhooks: boolean;
  /** Provider supports real-time data updates */
  supportsRealtime: boolean;
  /** Provider requires periodic re-authentication */
  requiresReauth: boolean;
  /** Provider supports manual sync triggering */
  supportsManualSync: boolean;
  /** Provider supports automatic scheduled sync */
  supportsAutoSync: boolean;
  /** Default interval between auto-syncs (milliseconds) */
  defaultSyncInterval?: number;
  /** Minimum interval between syncs due to rate limits (milliseconds) */
  minSyncInterval?: number;
}

/**
 * Metadata describing a bank data provider
 */
export interface ProviderMetadata {
  /** Provider type identifier */
  type: BANK_PROVIDER_TYPE;
  /** Display name for UI */
  name: string;
  /** Short description of the provider */
  description: string;
  /** URL to provider logo image */
  logoUrl?: string;
  /** URL to provider documentation */
  documentationUrl?: string;
  /** Provider feature capabilities */
  features: ProviderFeatures;
}

// ============================================================================
// Provider Data Types
// ============================================================================

/**
 * Date range for querying transactions
 */
export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Bank account from external provider
 */
export interface ProviderAccount {
  /** Provider's unique identifier for this account */
  externalId: string;
  /** Account name/label */
  name: string;
  /** Account type (e.g., 'debit', 'credit', 'savings') */
  type: string;
  /** Current account balance (in cents) */
  balance: Cents;
  /** Currency code (e.g., 'UAH', 'USD') */
  currency: string;
  /** Additional provider-specific data */
  metadata?: Record<string, unknown>;
}

/**
 * Transaction from external provider
 */
export interface ProviderTransaction {
  /** Provider's unique identifier for this transaction */
  externalId: string;
  /** Transaction amount in cents (positive for income, negative for expense) */
  amount: Cents;
  /** Currency code */
  currency: string;
  /** Transaction date */
  date: Date;
  /** Transaction description */
  description: string;
  /** Merchant/counterparty name */
  merchantName?: string;
  /** Transaction category (if provided by provider) */
  category?: string;
  /** Additional provider-specific data */
  metadata?: Record<string, unknown>;
}

/**
 * Account balance information from provider
 */
export interface ProviderBalance {
  /** Balance amount (in cents) */
  amount: Cents;
  /** Currency code */
  currency: string;
  /** Timestamp when balance was retrieved */
  asOf: Date;
}

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Base interface that all bank data providers must implement.
 * This ensures a consistent API regardless of the underlying provider.
 */
export interface IBankDataProvider {
  // ========================================
  // Metadata
  // ========================================

  /** Provider metadata (name, features, credential fields, etc.) */
  readonly metadata: ProviderMetadata;

  // ========================================
  // Connection Management
  // ========================================

  /**
   * Create a new connection to this provider for a user
   * @param userId - User creating the connection
   * @param credentials - Provider-specific credentials
   * @returns Connection ID
   */
  connect(userId: number, credentials: unknown): Promise<number>;

  /**
   * Disconnect and remove a provider connection
   * @param connectionId - Connection to disconnect
   */
  disconnect(connectionId: number): Promise<void>;

  /**
   * Validate credentials by testing connection to provider
   * @param credentials - Credentials to validate
   * @returns True if credentials are valid
   */
  validateCredentials(credentials: unknown): Promise<boolean>;

  /**
   * Update credentials for an existing connection
   * @param connectionId - Connection to update
   * @param newCredentials - New credentials to store
   */
  refreshCredentials(connectionId: number, newCredentials: unknown): Promise<void>;

  // ========================================
  // Account Operations
  // ========================================

  /**
   * Fetch list of accounts from provider (without saving to DB)
   * @param connectionId - Connection to fetch accounts from
   * @returns List of provider accounts
   */
  fetchAccounts(connectionId: number): Promise<ProviderAccount[]>;

  // ========================================
  // Transaction Operations
  // ========================================

  /**
   * Fetch transactions for a specific account (without saving to DB)
   * @param connectionId - Connection ID
   * @param accountExternalId - Provider's account ID
   * @param dateRange - Optional date range to filter transactions
   * @returns List of transactions
   */
  fetchTransactions(
    connectionId: number,
    accountExternalId: string,
    dateRange?: DateRange,
  ): Promise<ProviderTransaction[]>;

  /**
   * Sync transactions for a specific account to our database
   * @param connectionId - Connection ID
   * @param systemAccountId - Our internal account ID
   * @param userId - User ID for SSE notifications
   * @returns Either void (immediate sync) or job info (queue-based sync)
   */
  syncTransactions({
    connectionId,
    systemAccountId,
    userId,
  }: {
    connectionId: number;
    systemAccountId: number;
    userId: number;
  }): Promise<void | { jobGroupId: string; totalBatches: number; estimatedMinutes: number }>;

  // ========================================
  // Balance Operations
  // ========================================

  /**
   * Fetch current balance for a specific account
   * @param connectionId - Connection ID
   * @param accountExternalId - Provider's account ID
   * @returns Current balance
   */
  fetchBalance(connectionId: number, accountExternalId: string): Promise<ProviderBalance>;

  /**
   * Refresh balance for a specific account in our system
   * @param connectionId - Connection ID
   * @param systemAccountId - Our internal account ID
   */
  refreshBalance(connectionId: number, systemAccountId: number): Promise<void>;

  // ========================================
  // Webhook Support (Optional)
  // ========================================

  /**
   * Set up webhook for real-time updates (if supported)
   * @param connectionId - Connection to set up webhook for
   * @param webhookUrl - URL to receive webhook notifications
   */
  setupWebhook?(connectionId: number, webhookUrl: string): Promise<void>;

  /**
   * Handle incoming webhook payload (if supported)
   * @param payload - Webhook payload from provider
   */
  handleWebhook?(payload: unknown): Promise<void>;
}
