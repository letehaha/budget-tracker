/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ACCOUNT_TYPES,
  BANK_PROVIDER_TYPE,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { BadRequestError, ForbiddenError, ValidationError } from '@js/errors';
import { logger } from '@js/utils';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import Transactions from '@models/Transactions.model';
import { getUserDefaultCategory } from '@models/Users.model';
import {
  BaseBankDataProvider,
  DateRange,
  ProviderAccount,
  ProviderBalance,
  ProviderMetadata,
  ProviderTransaction,
} from '@services/bank-data-providers';
import { createTransaction } from '@services/transactions';
import { Sequelize } from 'sequelize';

import { SyncStatus, setAccountSyncStatus } from '../sync/sync-status-tracker';
import { encryptCredentials } from '../utils/credential-encryption';
import { emitTransactionsSyncEvent } from '../utils/emit-transactions-sync-event';
import { LunchFlowApiClient } from './api-client';
import {
  LunchFlowApiAccountsResponse,
  LunchFlowApiTransactionsResponse,
  LunchFlowCredentials,
  LunchFlowMetadata,
} from './types';

/**
 * LunchFlow provider implementation
 * Handles integration with LunchFlow API for multi-bank account access worldwide
 */
export class LunchFlowProvider extends BaseBankDataProvider {
  readonly metadata: ProviderMetadata = {
    type: BANK_PROVIDER_TYPE.LUNCHFLOW,
    name: 'Lunch Flow',
    description: 'Sync transactions from 20,000+ banks worldwide via LunchFlow',
    features: {
      supportsWebhooks: false,
      supportsRealtime: false,
      requiresReauth: false,
      supportsManualSync: true,
      supportsAutoSync: true,
      defaultSyncInterval: 12 * 60 * 60 * 1000, // 12 hours
      minSyncInterval: 5 * 60 * 1000, // 5 minutes
    },
  };

  // ============================================================================
  // Connection Management
  // ============================================================================

  async connect(userId: number, credentials: unknown): Promise<number> {
    if (!this.isValidCredentials(credentials)) {
      throw new ValidationError({ message: t({ key: 'bankDataProviders.lunchflow.invalidCredentialsFormat' }) });
    }

    const { apiKey } = credentials;

    const isValid = await this.validateCredentials(credentials);
    if (!isValid) {
      throw new ForbiddenError({ message: t({ key: 'bankDataProviders.lunchflow.invalidApiKey' }) });
    }

    const apiClient = new LunchFlowApiClient(apiKey);
    const { accounts } = await apiClient.getAccounts();

    // Generate connection name with counter for multiple connections
    const existingConnections = await BankDataProviderConnections.count({
      where: { userId, providerType: this.metadata.type },
    });
    const providerName = existingConnections > 0 ? `LunchFlow (${existingConnections + 1})` : 'LunchFlow';

    const connection = await BankDataProviderConnections.create({
      userId,
      providerType: this.metadata.type,
      providerName,
      isActive: true,
      credentials: encryptCredentials({ apiKey }),
      metadata: {
        accountCount: accounts.length,
        consecutiveAuthFailures: 0,
        deactivationReason: null,
      } as LunchFlowMetadata,
    } as any);

    return connection.id;
  }

  async disconnect(connectionId: number): Promise<void> {
    const connection = await this.getConnection(connectionId);
    this.validateProviderType(connection);

    await connection.destroy();
  }

  async validateCredentials(credentials: unknown): Promise<boolean> {
    if (!this.isValidCredentials(credentials)) {
      return false;
    }

    const apiClient = new LunchFlowApiClient(credentials.apiKey);

    try {
      return await apiClient.testConnection();
    } catch {
      return false;
    }
  }

  async refreshCredentials(connectionId: number, newCredentials: unknown): Promise<void> {
    if (!this.isValidCredentials(newCredentials)) {
      throw new ValidationError({ message: t({ key: 'bankDataProviders.lunchflow.invalidCredentialsFormat' }) });
    }

    const connection = await this.getConnection(connectionId);
    this.validateProviderType(connection);

    const isValid = await this.validateCredentials(newCredentials);
    if (!isValid) {
      throw new ForbiddenError({ message: t({ key: 'bankDataProviders.lunchflow.invalidApiKey' }) });
    }

    connection.setEncryptedCredentials({ apiKey: newCredentials.apiKey });

    // Reset auth failure tracking and reactivate
    const metadata = (connection.metadata as LunchFlowMetadata) || {};
    metadata.consecutiveAuthFailures = 0;
    metadata.deactivationReason = null;
    connection.metadata = metadata as any;
    connection.isActive = true;

    await connection.save();
  }

  // ============================================================================
  // Account Operations
  // ============================================================================

  async fetchAccounts(connectionId: number): Promise<ProviderAccount[]> {
    const { apiKey } = await this.getValidatedCredentials(connectionId);

    const apiClient = new LunchFlowApiClient(apiKey);

    let accountsResponse: LunchFlowApiAccountsResponse;
    try {
      accountsResponse = await apiClient.getAccounts();
      await this.resetAuthFailures(connectionId);
    } catch (error) {
      await this.handleAuthError({ connectionId, error });
      throw error;
    }

    // Only return ACTIVE accounts (include accounts with no status — benefit of the doubt)
    const activeAccounts = accountsResponse.accounts.filter((acc) => !acc.status || acc.status === 'ACTIVE');

    // Fetch balances in parallel to avoid N+1 sequential API calls
    // Balance response also provides the currency for each account
    const balanceResults = await Promise.allSettled(
      activeAccounts.map((account) => apiClient.getBalance({ accountId: account.id })),
    );

    return activeAccounts.reduce<ProviderAccount[]>((result, account, index) => {
      const balanceResult = balanceResults[index]!;
      let balance = 0;
      // Use account-level currency as fallback; balance response takes precedence
      let currency = account.currency || '';
      if (balanceResult.status === 'fulfilled') {
        balance = Money.fromDecimal(balanceResult.value.balance.amount).toCents();
        currency = balanceResult.value.balance.currency || currency;
      } else {
        logger.warn(`[LunchFlow] Failed to fetch balance for account ${account.id}, defaulting to 0`);
      }

      if (!currency) {
        logger.error({
          message: `[LunchFlow] Skipping account ${account.id} (${account.name}): no currency available from account or balance response`,
        });
        return result;
      }

      result.push({
        externalId: String(account.id),
        name: account.name,
        type: 'bank' as const,
        balance,
        currency,
        metadata: {
          institutionName: account.institution_name,
          institutionLogo: account.institution_logo,
          provider: account.provider,
          status: account.status,
        },
      });
      return result;
    }, []);
  }

  // ============================================================================
  // Transaction Operations
  // ============================================================================

  async fetchTransactions(
    connectionId: number,
    accountExternalId: string,
    _dateRange?: DateRange, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<ProviderTransaction[]> {
    const { apiKey } = await this.getValidatedCredentials(connectionId);

    const apiClient = new LunchFlowApiClient(apiKey);
    const accountId = parseInt(accountExternalId, 10);
    const { transactions } = await apiClient.getTransactions({ accountId });

    return transactions
      .filter((tx) => tx.id !== null)
      .map((tx) => ({
        externalId: tx.id!,
        amount: tx.amount,
        currency: tx.currency,
        date: new Date(tx.date),
        description: tx.description || tx.merchant || '',
        merchantName: tx.merchant,
        metadata: {
          merchant: tx.merchant,
          description: tx.description,
          lunchflowAccountId: tx.accountId,
        },
      }));
  }

  async syncTransactions({
    connectionId,
    systemAccountId,
    userId,
  }: {
    connectionId: number;
    systemAccountId: number;
    userId: number;
  }): Promise<void> {
    await setAccountSyncStatus({ accountId: systemAccountId, status: SyncStatus.SYNCING, userId });

    try {
      const account = await this.getSystemAccount(systemAccountId);
      const connection = await this.getConnection(connectionId);
      this.validateProviderType(connection);

      if (!account.externalId) {
        throw new BadRequestError({ message: t({ key: 'bankDataProviders.lunchflow.accountNoExternalId' }) });
      }

      const { apiKey } = await this.getValidatedCredentials(connectionId);
      const apiClient = new LunchFlowApiClient(apiKey);
      const accountId = parseInt(account.externalId, 10);

      let transactionsResponse: LunchFlowApiTransactionsResponse;
      try {
        transactionsResponse = await apiClient.getTransactions({ accountId });
        await this.resetAuthFailures(connectionId);
      } catch (error) {
        await this.handleAuthError({ connectionId, error });
        throw error;
      }

      // Filter out pending transactions (those with null IDs)
      let postedTransactions = transactionsResponse.transactions.filter((tx) => tx.id !== null);

      // LunchFlow API doesn't support date-range filtering, so we filter in runtime.
      // Only process transactions on or after the latest existing transaction date.
      const latestTransaction = await Transactions.findOne({
        where: { accountId: account.id },
        order: [['time', 'DESC']],
      });

      if (latestTransaction) {
        const fromDate = new Date(latestTransaction.time);
        postedTransactions = postedTransactions.filter((tx) => new Date(tx.date) >= fromDate);
      }

      // Sort by date ascending
      postedTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const { defaultCategoryId } = (await getUserDefaultCategory({ id: connection.userId }))!;
      const createdTransactionIds: number[] = [];

      for (const tx of postedTransactions) {
        // Primary dedup: check by originalId (covers normal re-sync)
        const existingTx = await Transactions.findOne({
          where: {
            accountId: account.id,
            originalId: tx.id!,
          },
        });

        if (existingTx) {
          continue;
        }

        // Secondary dedup: check externalData.originalSource.originalId
        // This covers the unlink→relink flow where originalId was cleared to null
        // but the original value was preserved in externalData
        const existingByOriginalSource = await Transactions.findOne({
          where: Sequelize.and(
            { accountId: account.id, originalId: null },
            Sequelize.where(Sequelize.literal(`"externalData"#>>'{originalSource,originalId}'`), tx.id!),
          ),
        });

        if (existingByOriginalSource) {
          // Restore the originalId so future syncs use the fast primary path
          await existingByOriginalSource.update({ originalId: tx.id! });
          continue;
        }

        const isExpense = tx.amount < 0;

        const [createdTx] = await createTransaction({
          originalId: tx.id!,
          note: tx.description || tx.merchant || '',
          amount: Money.fromDecimal(Math.abs(tx.amount)),
          time: new Date(tx.date),
          externalData: {
            merchant: tx.merchant,
            description: tx.description,
            lunchflowAccountId: tx.accountId,
          },
          commissionRate: Money.fromCents(0),
          cashbackAmount: Money.fromCents(0),
          accountId: account.id,
          userId: connection.userId,
          transactionType: isExpense ? TRANSACTION_TYPES.expense : TRANSACTION_TYPES.income,
          paymentType: PAYMENT_TYPES.bankTransfer,
          categoryId: defaultCategoryId,
          transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
          accountType: ACCOUNT_TYPES.lunchflow,
        });

        createdTransactionIds.push(createdTx.id);
      }

      if (createdTransactionIds.length > 0) {
        logger.info(`[LunchFlow] Sync: ${createdTransactionIds.length} transactions created for account ${account.id}`);
      }

      // Update account balance
      try {
        const balanceResponse = await apiClient.getBalance({ accountId });
        const balanceMoney = Money.fromDecimal(balanceResponse.balance.amount);
        await account.update({ currentBalance: balanceMoney });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.warn(`[LunchFlow] Failed to update balance for account ${account.id}: ${errorMsg}`);
      }

      await this.updateLastSync(connectionId);

      emitTransactionsSyncEvent({
        userId: connection.userId,
        accountId: account.id,
        transactionIds: createdTransactionIds,
      });

      await setAccountSyncStatus({ accountId: systemAccountId, status: SyncStatus.COMPLETED, userId });
    } catch (error) {
      logger.error({ message: '[LunchFlow] Sync error:', error: error as Error });
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

  // ============================================================================
  // Balance Operations
  // ============================================================================

  async fetchBalance(connectionId: number, accountExternalId: string): Promise<ProviderBalance> {
    const { apiKey } = await this.getValidatedCredentials(connectionId);

    const apiClient = new LunchFlowApiClient(apiKey);
    const accountId = parseInt(accountExternalId, 10);
    const { balance } = await apiClient.getBalance({ accountId });

    return {
      amount: Money.fromDecimal(balance.amount).toCents(),
      currency: balance.currency,
      asOf: new Date(),
    };
  }

  async refreshBalance(connectionId: number, systemAccountId: number): Promise<void> {
    const account = await this.getSystemAccount(systemAccountId);

    if (!account.externalId) {
      throw new BadRequestError({ message: t({ key: 'bankDataProviders.lunchflow.accountNoExternalId' }) });
    }

    const balance = await this.fetchBalance(connectionId, account.externalId);

    await account.update({
      currentBalance: balance.amount,
    });
  }

  // ============================================================================
  // Auth Failure Handling
  // ============================================================================

  /**
   * Handle auth errors with retry tracking.
   * After 2 consecutive auth failures, deactivate the connection.
   */
  private async handleAuthError({ connectionId, error }: { connectionId: number; error: unknown }): Promise<void> {
    const isForbiddenError = error instanceof ForbiddenError;
    if (!isForbiddenError) return;

    try {
      const connection = await this.getConnection(connectionId);
      const metadata = (connection.metadata as LunchFlowMetadata) || {};
      const failures = (metadata.consecutiveAuthFailures || 0) + 1;
      metadata.consecutiveAuthFailures = failures;

      if (failures >= 2) {
        connection.isActive = false;
        metadata.deactivationReason = 'auth_failure';
        logger.warn(`[LunchFlow] Connection ${connectionId} deactivated after ${failures} consecutive auth failures`);
      }

      connection.metadata = metadata as any;
      await connection.save();
    } catch (metaError) {
      logger.error({
        message: '[LunchFlow] Failed to update auth failure metadata:',
        error: metaError as Error,
      });
    }
  }

  /**
   * Reset consecutive auth failure counter on successful API call
   */
  private async resetAuthFailures(connectionId: number): Promise<void> {
    try {
      const connection = await this.getConnection(connectionId);
      const metadata = (connection.metadata as LunchFlowMetadata) || {};

      if (metadata.consecutiveAuthFailures && metadata.consecutiveAuthFailures > 0) {
        metadata.consecutiveAuthFailures = 0;
        connection.metadata = metadata as any;
        await connection.save();
      }
    } catch {
      // Non-critical, ignore
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private isValidCredentials(credentials: unknown): credentials is LunchFlowCredentials {
    if (typeof credentials !== 'object' || credentials === null || !('apiKey' in credentials)) {
      return false;
    }
    const { apiKey } = credentials as Record<string, unknown>;
    return typeof apiKey === 'string' && apiKey.length > 0;
  }

  private async getValidatedCredentials(connectionId: number): Promise<LunchFlowCredentials> {
    const credentials = await this.getDecryptedCredentials(connectionId);
    if (!this.isValidCredentials(credentials)) {
      throw new ValidationError({
        message: t({ key: 'bankDataProviders.lunchflow.invalidCredentialsFormat' }),
      });
    }
    return credentials;
  }
}
