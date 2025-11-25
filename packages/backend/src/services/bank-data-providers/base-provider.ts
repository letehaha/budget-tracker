/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotFoundError } from '@js/errors';
import Accounts from '@models/Accounts.model';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';

import { IBankDataProvider, ProviderAccount, ProviderMetadata } from './types';

/**
 * Abstract base class for all bank data providers.
 * Provides common functionality and enforces implementation of required methods.
 *
 * All providers (Monobank, Enable Banking, etc.) should extend this class.
 */
export abstract class BaseBankDataProvider implements IBankDataProvider {
  // ============================================================================
  // Abstract Properties - Must be implemented by child classes
  // ============================================================================

  /**
   * Provider metadata (name, features, credential fields, etc.)
   * Must be defined by each provider implementation
   */
  abstract readonly metadata: ProviderMetadata;

  // ============================================================================
  // Helper Methods - Available to all providers
  // ============================================================================

  /**
   * Get a connection from database by ID
   * @param connectionId - Connection ID to fetch
   * @returns Connection model instance
   * @throws NotFoundError if connection not found
   */
  protected async getConnection(connectionId: number): Promise<BankDataProviderConnections> {
    const connection = await BankDataProviderConnections.findByPk(connectionId);

    if (!connection) {
      throw new NotFoundError({
        message: `Bank data provider connection ${connectionId} not found`,
      });
    }

    return connection;
  }

  /**
   * Update last sync timestamp for a connection
   * @param connectionId - Connection ID to update
   */
  protected async updateLastSync(connectionId: number): Promise<void> {
    await BankDataProviderConnections.update({ lastSyncAt: new Date() }, { where: { id: connectionId } });
  }

  /**
   * Get a system account by ID
   * @param systemAccountId - Account ID to fetch
   * @returns Account model instance
   * @throws NotFoundError if account not found
   */
  protected async getSystemAccount(systemAccountId: number): Promise<Accounts> {
    const account = await Accounts.findByPk(systemAccountId);

    if (!account) {
      throw new NotFoundError({
        message: `Account ${systemAccountId} not found`,
      });
    }

    return account;
  }

  /**
   * Get decrypted credentials for a connection
   * @param connectionId - Connection ID
   * @returns Decrypted credentials object
   */
  protected async getDecryptedCredentials(connectionId: number): Promise<Record<string, unknown>> {
    const connection = await this.getConnection(connectionId);
    return connection.getDecryptedCredentials();
  }

  /**
   * Validate that a connection belongs to the correct provider type
   * @param connection - Connection to validate
   * @throws Error if provider type mismatch
   */
  protected validateProviderType(connection: BankDataProviderConnections): void {
    if (connection.providerType !== this.metadata.type) {
      throw new Error(
        `Connection ${connection.id} is for provider ${connection.providerType}, not ${this.metadata.type}`,
      );
    }
  }

  // ============================================================================
  // Abstract Methods - Must be implemented by child classes
  // ============================================================================

  /**
   * Create a new connection to this provider for a user
   * @param userId - User creating the connection
   * @param credentials - Provider-specific credentials
   * @returns Connection ID
   */
  abstract connect(userId: number, credentials: unknown): Promise<number>;

  /**
   * Disconnect and remove a provider connection
   * @param connectionId - Connection to disconnect
   */
  abstract disconnect(connectionId: number): Promise<void>;

  /**
   * Validate credentials by testing connection to provider
   * @param credentials - Credentials to validate
   * @returns True if credentials are valid
   */
  abstract validateCredentials(credentials: unknown): Promise<boolean>;

  /**
   * Update credentials for an existing connection
   * @param connectionId - Connection to update
   * @param newCredentials - New credentials to store
   */
  abstract refreshCredentials(connectionId: number, newCredentials: unknown): Promise<void>;

  /**
   * Fetch list of accounts from provider (without saving to DB)
   * @param connectionId - Connection to fetch accounts from
   * @returns List of provider accounts
   */
  abstract fetchAccounts(connectionId: number): Promise<ProviderAccount[]>;

  /**
   * Sync accounts from provider to our database
   * @param connectionId - Connection to sync accounts for
   */
  abstract syncAccounts(connectionId: number): Promise<void>;

  /**
   * Fetch transactions for a specific account (without saving to DB)
   * @param connectionId - Connection ID
   * @param accountExternalId - Provider's account ID
   * @param dateRange - Optional date range to filter transactions
   * @returns List of transactions
   */
  abstract fetchTransactions(connectionId: number, accountExternalId: string, dateRange?: any): Promise<any[]>;

  /**
   * Sync transactions for a specific account to our database
   * @param connectionId - Connection ID
   * @param systemAccountId - Our internal account ID
   * @returns Either void (immediate sync) or job info (queue-based sync)
   */
  abstract syncTransactions({
    connectionId,
    systemAccountId,
  }: {
    connectionId: number;
    systemAccountId: number;
  }): Promise<void | { jobGroupId: string; totalBatches: number; estimatedMinutes: number }>;

  /**
   * Fetch current balance for a specific account
   * @param connectionId - Connection ID
   * @param accountExternalId - Provider's account ID
   * @returns Current balance
   */
  abstract fetchBalance(connectionId: number, accountExternalId: string): Promise<any>;

  /**
   * Refresh balance for a specific account in our system
   * @param connectionId - Connection ID
   * @param systemAccountId - Our internal account ID
   */
  abstract refreshBalance(connectionId: number, systemAccountId: number): Promise<void>;

  /**
   * Set up webhook for real-time updates (if supported)
   * Optional method - only implement if provider supports webhooks
   * @param connectionId - Connection to set up webhook for
   * @param webhookUrl - URL to receive webhook notifications
   */
  setupWebhook?(connectionId: number, webhookUrl: string): Promise<void>;

  /**
   * Handle incoming webhook payload (if supported)
   * Optional method - only implement if provider supports webhooks
   * @param payload - Webhook payload from provider
   */
  handleWebhook?(payload: unknown): Promise<void>;
}
