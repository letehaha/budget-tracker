/* eslint-disable @typescript-eslint/no-explicit-any */
import { BANK_PROVIDER_TYPE, asCents } from '@bt/shared/types';
import { ExternalMonobankClientInfoResponse } from '@bt/shared/types/external-services';
import { t } from '@i18n/index';
import { BadRequestError, ForbiddenError, NotFoundError, ValidationError } from '@js/errors';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import Transactions from '@models/Transactions.model';
import {
  BaseBankDataProvider,
  DateRange,
  ProviderAccount,
  ProviderBalance,
  ProviderMetadata,
  ProviderTransaction,
} from '@services/bank-data-providers';
import cc from 'currency-codes';

import { SyncStatus, setAccountSyncStatus } from '../sync/sync-status-tracker';
import { encryptCredentials } from '../utils/credential-encryption';
import { MonobankApiClient } from './api-client';
import { getJobGroupProgress, queueTransactionSync } from './transaction-sync-queue';
import { MonobankCredentials, MonobankMetadata } from './types';

/**
 * Monobank provider implementation
 * Handles integration with Monobank API for account and transaction syncing
 */
export class MonobankProvider extends BaseBankDataProvider {
  readonly metadata: ProviderMetadata = {
    type: BANK_PROVIDER_TYPE.MONOBANK,
    name: 'Monobank',
    description: 'Ukrainian digital bank with API access for personal finance tracking',
    features: {
      supportsWebhooks: true,
      supportsRealtime: true,
      requiresReauth: false,
      supportsManualSync: true,
      supportsAutoSync: true,
      defaultSyncInterval: 4 * 60 * 60 * 1000, // 4 hours
      minSyncInterval: 60 * 1000, // 1 minute (Monobank API rate limit)
    },
  };

  // ============================================================================
  // Connection Management
  // ============================================================================

  async connect(userId: number, credentials: unknown): Promise<number> {
    // Validate credentials structure
    if (!this.isValidCredentials(credentials)) {
      throw new ValidationError({ message: t({ key: 'bankDataProviders.monobank.invalidCredentialsFormat' }) });
    }

    const { apiToken } = credentials;

    // Validate token by calling Monobank API
    const isValid = await this.validateCredentials(credentials);
    if (!isValid) {
      throw new ForbiddenError({ message: t({ key: 'bankDataProviders.monobank.invalidApiToken' }) });
    }

    const apiClient = new MonobankApiClient(apiToken);
    // Get client info from Monobank (bypass cache to ensure fresh data during connection)
    const clientInfo = await apiClient.getClientInfo({ bypassCache: true });

    // Create connection in database
    const connection = await BankDataProviderConnections.create({
      userId,
      providerType: this.metadata.type,
      providerName: clientInfo.name || 'Monobank Account',
      isActive: true,
      credentials: encryptCredentials({ apiToken }),
      metadata: {
        clientId: clientInfo.clientId,
        webHookUrl: clientInfo.webHookUrl,
        userName: clientInfo.name,
      },
    } as any);

    return connection.id;
  }

  async disconnect(connectionId: number): Promise<void> {
    const connection = await this.getConnection(connectionId);
    this.validateProviderType(connection);

    // Delete the connection (CASCADE will handle related accounts via SET NULL)
    await connection.destroy();
  }

  async validateCredentials(credentials: unknown): Promise<boolean> {
    if (!this.isValidCredentials(credentials)) {
      return false;
    }

    const { apiToken } = credentials;
    const apiClient = new MonobankApiClient(apiToken);

    try {
      return await apiClient.testConnection();
    } catch {
      // Network or other errors - consider as invalid
      return false;
    }
  }

  async refreshCredentials(connectionId: number, newCredentials: unknown): Promise<void> {
    if (!this.isValidCredentials(newCredentials)) {
      throw new ValidationError({ message: t({ key: 'bankDataProviders.monobank.invalidCredentialsFormat' }) });
    }

    const connection = await this.getConnection(connectionId);
    this.validateProviderType(connection);

    // Validate new credentials
    const isValid = await this.validateCredentials(newCredentials);
    if (!isValid) {
      throw new ForbiddenError({ message: t({ key: 'bankDataProviders.monobank.invalidApiToken' }) });
    }

    // Update credentials - newCredentials is validated as MonobankCredentials, cast to Record for encryption
    connection.setEncryptedCredentials(newCredentials as unknown as Record<string, unknown>);
    await connection.save();
  }

  // ============================================================================
  // Account Operations
  // ============================================================================

  async fetchAccounts(connectionId: number): Promise<ProviderAccount[]> {
    const { apiToken } = await this.getValidatedCredentials(connectionId);

    const apiClient = new MonobankApiClient(apiToken);
    const clientInfo = await apiClient.getClientInfo();

    return this.transformMonobankAccounts(clientInfo);
  }

  // ============================================================================
  // Transaction Operations
  // ============================================================================

  async fetchTransactions(
    connectionId: number,
    accountExternalId: string,
    dateRange?: DateRange,
  ): Promise<ProviderTransaction[]> {
    const { apiToken } = await this.getValidatedCredentials(connectionId);

    const apiClient = new MonobankApiClient(apiToken);

    // Default to last 31 days if no date range provided
    const to = dateRange?.to || new Date();
    const from = dateRange?.from || new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

    const fromTimestamp = Math.floor(from.getTime() / 1000);
    const toTimestamp = Math.floor(to.getTime() / 1000);

    const transactions = await apiClient.getStatement(accountExternalId, fromTimestamp, toTimestamp);

    return transactions.map((tx) => ({
      externalId: tx.id,
      amount: asCents(tx.amount),
      currency: this.getCurrencyCodeFromMonobank(tx.currencyCode),
      date: new Date(tx.time * 1000),
      description: tx.description,
      merchantName: tx.counterName,
      metadata: {
        mcc: tx.mcc,
        hold: tx.hold,
        cashbackAmount: tx.cashbackAmount,
        balance: tx.balance,
        commissionRate: tx.commissionRate,
        operationAmount: tx.operationAmount,
        receiptId: tx.receiptId,
      },
    }));
  }

  /**
   * Sync transactions (queue-based for Monobank)
   * Automatically determines date range from most recent transaction or last 31 days
   */
  async syncTransactions({
    connectionId,
    systemAccountId,
    userId,
  }: {
    connectionId: number;
    systemAccountId: number;
    userId: number;
  }): Promise<{ jobGroupId: string; totalBatches: number; estimatedMinutes: number }> {
    // Set status to QUEUED (jobs are queued, not actively syncing yet)
    await setAccountSyncStatus({ accountId: systemAccountId, status: SyncStatus.QUEUED, userId });

    try {
      const account = await this.getSystemAccount(systemAccountId);

      // Find the most recent transaction for this account
      const latestTransaction = await Transactions.findOne({
        where: {
          accountId: account.id,
        },
        order: [['time', 'DESC']],
      });

      // Default to last 31 days if no transactions found
      const from = latestTransaction
        ? new Date(latestTransaction.time)
        : new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      const to = new Date();

      return this.loadTransactionsForPeriod({
        connectionId,
        systemAccountId,
        userId,
        from,
        to,
      });
      // Worker will set SYNCING when it starts, then COMPLETED when done
    } catch (error) {
      // Set status to FAILED on error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await setAccountSyncStatus({
        accountId: systemAccountId,
        status: SyncStatus.FAILED,
        error: errorMessage,
        userId,
      });
      throw error;
    }
  }

  /**
   * Load transactions for a specific date period using queue system
   * Handles Monobank rate limits and splits into 31-day chunks
   */
  async loadTransactionsForPeriod({
    connectionId,
    systemAccountId,
    userId,
    from,
    to,
  }: {
    connectionId: number;
    systemAccountId: number;
    userId: number;
    from: Date;
    to: Date;
  }): Promise<{ jobGroupId: string; totalBatches: number; estimatedMinutes: number }> {
    const account = await this.getSystemAccount(systemAccountId);
    const connection = await this.getConnection(connectionId);
    this.validateProviderType(connection);

    if (!account.externalId) {
      throw new BadRequestError({ message: t({ key: 'accounts.accountNoExternalIdMonobank' }) });
    }

    const { apiToken } = await this.getValidatedCredentials(connectionId);

    // Queue the transaction sync job
    const result = await queueTransactionSync({
      userId,
      accountId: account.id,
      connectionId,
      externalAccountId: account.externalId,
      apiToken,
      from,
      to,
    });

    return result;
  }

  /**
   * Get progress of a queued transaction sync job
   */
  async getTransactionSyncProgress(jobGroupId: string): Promise<{
    totalBatches: number;
    completedBatches: number;
    failedBatches: number;
    activeBatches: number;
    waitingBatches: number;
    status: 'waiting' | 'active' | 'completed' | 'failed' | 'partial';
    progress?: unknown;
  }> {
    return getJobGroupProgress(jobGroupId);
  }

  // ============================================================================
  // Balance Operations
  // ============================================================================

  async fetchBalance(connectionId: number, accountExternalId: string): Promise<ProviderBalance> {
    const { apiToken } = await this.getValidatedCredentials(connectionId);
    const apiClient = new MonobankApiClient(apiToken);
    const clientInfo = await apiClient.getClientInfo();

    const account = clientInfo.accounts.find((acc) => acc.id === accountExternalId);

    if (!account) {
      throw new NotFoundError({
        message: t({ key: 'bankDataProviders.monobank.accountNotFound', variables: { accountExternalId } }),
      });
    }

    return {
      amount: asCents(account.balance),
      currency: this.getCurrencyCodeFromMonobank(account.currencyCode),
      asOf: new Date(),
    };
  }

  async refreshBalance(connectionId: number, systemAccountId: number): Promise<void> {
    const account = await this.getSystemAccount(systemAccountId);

    if (!account.externalId) {
      throw new BadRequestError({ message: t({ key: 'accounts.accountNoExternalId' }) });
    }

    const balance = await this.fetchBalance(connectionId, account.externalId);

    await account.update({
      currentBalance: balance.amount,
      // TODO: calculate and update refCurrentBalance
    });
  }

  // ============================================================================
  // Webhook Support
  // ============================================================================

  async setupWebhook(connectionId: number, webhookUrl: string): Promise<void> {
    const { apiToken } = await this.getValidatedCredentials(connectionId);
    const apiClient = new MonobankApiClient(apiToken);
    await apiClient.setWebhook(webhookUrl);

    // Update metadata with webhook URL
    const connection = await this.getConnection(connectionId);
    const metadata = (connection.metadata as MonobankMetadata) || {};
    metadata.webHookUrl = webhookUrl;
    connection.metadata = metadata as any;
    await connection.save();
  }

  async handleWebhook(): Promise<void> {
    // TODO: Implement webhook handling
    // This would involve:
    // 1. Validate webhook signature (if Monobank provides one)
    // 2. Extract transaction data from payload
    // 3. Find the corresponding account
    // 4. Create the transaction in database
    throw new Error(t({ key: 'bankDataProviders.monobank.webhookNotImplemented' }));
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Type guard for Monobank credentials
   */
  private isValidCredentials(credentials: unknown): credentials is MonobankCredentials {
    return (
      typeof credentials === 'object' &&
      credentials !== null &&
      'apiToken' in credentials &&
      typeof (credentials as any).apiToken === 'string' &&
      (credentials as any).apiToken.length > 0
    );
  }

  private async getValidatedCredentials(connectionId: number): Promise<MonobankCredentials> {
    const credentials = await this.getDecryptedCredentials(connectionId);
    if (!this.isValidCredentials(credentials)) {
      throw new ValidationError({ message: t({ key: 'bankDataProviders.monobank.invalidCredentialsFormat' }) });
    }
    return credentials;
  }

  /**
   * Transform Monobank API response to ProviderAccount format
   */
  private transformMonobankAccounts(clientInfo: ExternalMonobankClientInfoResponse): ProviderAccount[] {
    return clientInfo.accounts.map((account) => ({
      externalId: account.id,
      name: this.getAccountName(account),
      type: account.type,
      balance: account.balance,
      currency: this.getCurrencyCodeFromMonobank(account.currencyCode),
      metadata: {
        creditLimit: account.creditLimit,
        currencyCode: account.currencyCode,
        cashbackType: account.cashbackType,
        maskedPan: account.maskedPan,
        iban: account.iban,
        sendId: account.sendId,
      },
    }));
  }

  /**
   * Generate a user-friendly account name
   */
  private getAccountName(account: ExternalMonobankClientInfoResponse['accounts'][0]): string {
    const cardType = this.formatCardType(account.type);
    const lastFourDigits = account.maskedPan[0]?.slice(-4) || '';

    if (lastFourDigits) {
      return `${cardType} ****${lastFourDigits}`;
    }

    return cardType;
  }

  /**
   * Format Monobank card type to user-friendly name
   */
  private formatCardType(type: string): string {
    const typeMap: Record<string, string> = {
      black: 'Black Card',
      white: 'White Card',
      platinum: 'Platinum Card',
      iron: 'Iron Card',
      fop: 'FOP Card',
      yellow: 'Yellow Card',
      eAid: 'eAid Card',
    };

    return typeMap[type] || type;
  }

  /**
   * Convert Monobank currency code (ISO 4217 numeric) to string code
   * @param numericCode - Numeric currency code from Monobank
   * @returns Currency code string (e.g., 'UAH', 'USD')
   */
  private getCurrencyCodeFromMonobank(numericCode: number): string {
    const currency = cc.number(String(numericCode));
    if (!currency) {
      throw new ValidationError({
        message: t({ key: 'bankDataProviders.monobank.unknownCurrencyCode', variables: { numericCode } }),
      });
    }
    return currency.code;
  }
}
