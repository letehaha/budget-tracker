/* eslint-disable @typescript-eslint/no-explicit-any */
import { DEACTIVATION_REASON, type DeactivationReason } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { ForbiddenError } from '@js/errors';
import { logger } from '@js/utils';
import Accounts from '@models/accounts.model';
import BankDataProviderConnections from '@models/bank-data-provider-connections.model';

import {
  DateRange,
  IBankDataProvider,
  ProviderAccount,
  ProviderBalance,
  ProviderMetadata,
  ProviderTransaction,
} from './types';

/**
 * Shape of connection-metadata fields used by the shared auth-failure
 * tracking. Provider-specific metadata interfaces should include these
 * fields (and may add their own).
 */
interface AuthTrackingMetadata {
  consecutiveAuthFailures?: number;
  deactivationReason?: DeactivationReason | null;
}

/**
 * After this many consecutive auth failures the connection is auto-deactivated
 * to stop us hammering the upstream with bad credentials.
 */
const AUTH_FAILURE_DEACTIVATION_THRESHOLD = 2;

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
  protected async getConnection(connectionId: string): Promise<BankDataProviderConnections> {
    return findOrThrowNotFound({
      query: BankDataProviderConnections.findByPk(connectionId),
      message: t({ key: 'errors.connectionIdNotFound', variables: { connectionId } }),
    });
  }

  /**
   * Update last sync timestamp for a connection
   * @param connectionId - Connection ID to update
   */
  protected async updateLastSync(connectionId: string): Promise<void> {
    await BankDataProviderConnections.update({ lastSyncAt: new Date() }, { where: { id: connectionId } });
  }

  /**
   * Get a system account by ID
   * @param systemAccountId - Account ID to fetch
   * @returns Account model instance
   * @throws NotFoundError if account not found
   */
  protected async getSystemAccount(systemAccountId: string): Promise<Accounts> {
    return findOrThrowNotFound({
      query: Accounts.findByPk(systemAccountId),
      message: t({ key: 'errors.accountIdNotFound', variables: { accountId: systemAccountId } }),
    });
  }

  /**
   * Get decrypted credentials for a connection
   * @param connectionId - Connection ID
   * @returns Decrypted credentials object
   */
  protected async getDecryptedCredentials(connectionId: string): Promise<Record<string, unknown>> {
    const connection = await this.getConnection(connectionId);
    return connection.getDecryptedCredentials();
  }

  // ============================================================================
  // Auth Failure Tracking
  // ============================================================================

  /**
   * Whether a thrown error represents an auth failure for this provider.
   * Default treats any `ForbiddenError` as an auth failure. Providers whose
   * upstream returns auth failures via different mechanisms (e.g. HTTP 401/403
   * wrapped in a custom error class) should override this.
   */
  protected isAuthError(error: unknown): boolean {
    return error instanceof ForbiddenError;
  }

  /**
   * Increment the connection's consecutive auth-failure counter and deactivate
   * the connection once the threshold is reached. Called by providers in the
   * catch branch of an authenticated call. No-ops for non-auth errors so call
   * sites can pass any caught error.
   */
  protected async handleAuthError({ connectionId, error }: { connectionId: string; error: unknown }): Promise<void> {
    if (!this.isAuthError(error)) return;

    try {
      const connection = await this.getConnection(connectionId);
      // Spread into a NEW object: Sequelize only flags a JSON(B) column dirty
      // when its reference changes, so mutating the existing metadata in place
      // and re-assigning the same reference would not persist on save().
      const metadata: AuthTrackingMetadata = { ...(connection.metadata as AuthTrackingMetadata) };
      const failures = (metadata.consecutiveAuthFailures || 0) + 1;
      metadata.consecutiveAuthFailures = failures;

      if (failures >= AUTH_FAILURE_DEACTIVATION_THRESHOLD) {
        connection.isActive = false;
        metadata.deactivationReason = DEACTIVATION_REASON.AUTH_FAILURE;
        logger.warn(
          `[${this.metadata.name}] Connection ${connectionId} deactivated after ${failures} consecutive auth failures`,
        );
      }

      connection.metadata = metadata as any;
      // `{ transaction: null }` bypasses the ambient CLS transaction: an auth
      // failure surfaces while a sync is being rolled back, so this write must
      // commit independently or the failure count (and deactivation) would be
      // undone by that rollback.
      await connection.save({ transaction: null });
    } catch (metaError) {
      logger.error({
        message: `[${this.metadata.name}] Failed to update auth failure metadata:`,
        error: metaError as Error,
      });
    }
  }

  /**
   * Reset the consecutive auth-failure counter after a successful call.
   * Failures here are swallowed because the recorded count is non-critical:
   * we'd rather risk an extra deactivation than fail a working request.
   */
  protected async resetAuthFailures(connectionId: string): Promise<void> {
    try {
      const connection = await this.getConnection(connectionId);
      // New object reference so Sequelize persists the reset (see handleAuthError).
      const metadata: AuthTrackingMetadata = { ...(connection.metadata as AuthTrackingMetadata) };

      if (metadata.consecutiveAuthFailures && metadata.consecutiveAuthFailures > 0) {
        metadata.consecutiveAuthFailures = 0;
        connection.metadata = metadata as any;
        // Commit outside any ambient sync transaction (see handleAuthError).
        await connection.save({ transaction: null });
      }
    } catch {
      // Non-critical, ignore
    }
  }

  /**
   * Validate that a connection belongs to the correct provider type
   * @param connection - Connection to validate
   * @throws Error if provider type mismatch
   */
  protected validateProviderType(connection: BankDataProviderConnections): void {
    if (connection.providerType !== this.metadata.type) {
      throw new Error(
        t({
          key: 'errors.providerTypeMismatch',
          variables: {
            connectionId: connection.id,
            actualType: connection.providerType,
            expectedType: this.metadata.type,
          },
        }),
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
  abstract connect(userId: number, credentials: unknown): Promise<string>;

  /**
   * Disconnect and remove a provider connection
   * @param connectionId - Connection to disconnect
   */
  abstract disconnect(connectionId: string): Promise<void>;

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
  abstract refreshCredentials(connectionId: string, newCredentials: unknown): Promise<void>;

  /**
   * Fetch list of accounts from provider (without saving to DB)
   * @param connectionId - Connection to fetch accounts from
   * @returns List of provider accounts
   */
  abstract fetchAccounts(connectionId: string): Promise<ProviderAccount[]>;

  /**
   * Fetch transactions for a specific account (without saving to DB)
   * @param connectionId - Connection ID
   * @param accountExternalId - Provider's account ID
   * @param dateRange - Optional date range to filter transactions
   * @returns List of transactions
   */
  abstract fetchTransactions(
    connectionId: string,
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
  abstract syncTransactions({
    connectionId,
    systemAccountId,
    userId,
  }: {
    connectionId: string;
    systemAccountId: string;
    userId: number;
  }): Promise<void | { jobGroupId: string; totalBatches: number; estimatedMinutes: number }>;

  /**
   * Fetch current balance for a specific account
   * @param connectionId - Connection ID
   * @param accountExternalId - Provider's account ID
   * @returns Current balance
   */
  abstract fetchBalance(connectionId: string, accountExternalId: string): Promise<ProviderBalance>;

  /**
   * Refresh balance for a specific account in our system
   * @param connectionId - Connection ID
   * @param systemAccountId - Our internal account ID
   */
  abstract refreshBalance(connectionId: string, systemAccountId: string): Promise<void>;

  /**
   * Set up webhook for real-time updates (if supported)
   * Optional method - only implement if provider supports webhooks
   * @param connectionId - Connection to set up webhook for
   * @param webhookUrl - URL to receive webhook notifications
   */
  setupWebhook?(connectionId: string, webhookUrl: string): Promise<void>;

  /**
   * Handle incoming webhook payload (if supported)
   * Optional method - only implement if provider supports webhooks
   * @param payload - Webhook payload from provider
   */
  handleWebhook?(payload: unknown): Promise<void>;

  /**
   * Load transactions for an explicit historical window (the account-details
   * "load data for period" picker). Optional — only providers that support
   * date-range historical loads implement it.
   *
   * `jobGroupId === null` is the explicit marker that the provider loaded
   * inline and already finished (so `createdCount` reports rows actually
   * created); a non-null `jobGroupId` means the work was queued and the caller
   * should poll progress.
   */
  loadTransactionsForPeriod?(args: {
    connectionId: string;
    systemAccountId: string;
    userId: number;
    from: Date;
    to: Date;
  }): Promise<{
    jobGroupId: string | null;
    totalBatches: number;
    estimatedMinutes: number;
    /** Rows created during an inline load (`jobGroupId === null`). */
    createdCount?: number;
  }>;

  /**
   * Sync several accounts of one connection in a single batched pass (optional).
   * Implemented only by providers whose upstream returns every account (with
   * transactions) in one response — e.g. SimpleFIN's `/accounts` — so the
   * orchestrators can fetch once per window instead of once per account.
   * Marks each account's sync status internally.
   */
  syncConnectionAccounts?(args: { connectionId: string; userId: number; systemAccountIds: string[] }): Promise<void>;
}
