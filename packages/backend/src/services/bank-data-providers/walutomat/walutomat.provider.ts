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
import { linkTransactions } from '@services/transactions/transactions-linking/link-transactions';
import axios from 'axios';
import { Op, Sequelize } from 'sequelize';

import { SyncStatus, setAccountSyncStatus } from '../sync/sync-status-tracker';
import { encryptCredentials } from '../utils/credential-encryption';
import { emitTransactionsSyncEvent } from '../utils/emit-transactions-sync-event';
import { type HistoryItem, type WalletBalance, WalutomatApiClient } from './api-client';
import { WalutomatCredentials, WalutomatMetadata } from './types';

const WALLET_EXTERNAL_ID_PREFIX = 'wallet-';
const DEFAULT_SYNC_MONTHS = 12;

/**
 * Extract currency code from wallet externalId.
 * e.g. "wallet-eur" → "EUR"
 */
function currencyFromExternalId(externalId: string): string {
  return externalId.replace(WALLET_EXTERNAL_ID_PREFIX, '').toUpperCase();
}

/**
 * Build a wallet externalId from currency code.
 * e.g. "EUR" → "wallet-eur"
 */
function externalIdFromCurrency(currency: string): string {
  return `${WALLET_EXTERNAL_ID_PREFIX}${currency.toLowerCase()}`;
}

/**
 * Build a human-readable description from a Walutomat history item.
 */
function buildTransactionDescription(item: HistoryItem): string {
  const detailMap = new Map(item.operationDetails.map((d) => [d.key, d.value]));

  const parts: string[] = [];

  const title = detailMap.get('title');
  if (title) {
    parts.push(title);
  }

  const recipientName = detailMap.get('recipientName');
  if (recipientName) {
    parts.push(recipientName);
  }

  const currencyPair = detailMap.get('currencyPair');
  const rate = detailMap.get('rate');
  if (currencyPair) {
    const rateStr = rate ? ` @ ${rate}` : '';
    parts.push(`${currencyPair}${rateStr}`);
  }

  if (parts.length > 0) {
    return parts.join(' — ');
  }

  // Fallback: humanize the operationDetailedType
  return item.operationDetailedType.replace(/_/g, ' ').toLowerCase();
}

/**
 * Walutomat provider implementation.
 * Handles integration with Walutomat currency exchange platform.
 */
export class WalutomatProvider extends BaseBankDataProvider {
  readonly metadata: ProviderMetadata = {
    type: BANK_PROVIDER_TYPE.WALUTOMAT,
    name: 'Walutomat',
    description: 'Polish currency exchange platform with 23 currencies',
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
      throw new ValidationError({
        message: t({ key: 'bankDataProviders.walutomat.invalidCredentialsFormat' }),
      });
    }

    const isValid = await this.validateCredentials(credentials);
    if (!isValid) {
      throw new ForbiddenError({ message: t({ key: 'bankDataProviders.walutomat.invalidApiKey' }) });
    }

    const client = this.createApiClient(credentials);
    const balances = await client.getBalances();

    const existingConnections = await BankDataProviderConnections.count({
      where: { userId, providerType: this.metadata.type },
    });
    const providerName = existingConnections > 0 ? `Walutomat (${existingConnections + 1})` : 'Walutomat';

    const connection = await BankDataProviderConnections.create({
      userId,
      providerType: this.metadata.type,
      providerName,
      isActive: true,
      credentials: encryptCredentials({
        apiKey: credentials.apiKey,
        privateKey: credentials.privateKey,
      }),
      metadata: {
        walletCount: balances.length,
        consecutiveAuthFailures: 0,
        deactivationReason: null,
      } as WalutomatMetadata,
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

    try {
      const client = this.createApiClient(credentials);
      return await client.testConnection();
    } catch {
      return false;
    }
  }

  async refreshCredentials(connectionId: number, newCredentials: unknown): Promise<void> {
    if (!this.isValidCredentials(newCredentials)) {
      throw new ValidationError({
        message: t({ key: 'bankDataProviders.walutomat.invalidCredentialsFormat' }),
      });
    }

    const connection = await this.getConnection(connectionId);
    this.validateProviderType(connection);

    const isValid = await this.validateCredentials(newCredentials);
    if (!isValid) {
      throw new ForbiddenError({ message: t({ key: 'bankDataProviders.walutomat.invalidApiKey' }) });
    }

    connection.setEncryptedCredentials({
      apiKey: newCredentials.apiKey,
      privateKey: newCredentials.privateKey,
    });

    const metadata = (connection.metadata as WalutomatMetadata) || {};
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
    const credentials = await this.getValidatedCredentials(connectionId);

    let balances: WalletBalance[];
    try {
      const client = this.createApiClient(credentials);
      balances = await client.getBalances();
      await this.resetAuthFailures(connectionId);
    } catch (error) {
      await this.handleAuthError({ connectionId, error });
      throw error;
    }

    return balances.map((wallet) => ({
      externalId: externalIdFromCurrency(wallet.currency),
      name: `${wallet.currency} Wallet`,
      type: 'bank' as const,
      balance: Money.fromDecimal(parseFloat(wallet.balanceAvailable)).toCents(),
      currency: wallet.currency,
      metadata: {
        balanceTotal: wallet.balanceTotal,
        balanceAvailable: wallet.balanceAvailable,
        balanceReserved: wallet.balanceReserved,
      },
    }));
  }

  // ============================================================================
  // Transaction Operations
  // ============================================================================

  async fetchTransactions(
    connectionId: number,
    accountExternalId: string,
    dateRange?: DateRange,
  ): Promise<ProviderTransaction[]> {
    const credentials = await this.getValidatedCredentials(connectionId);
    const client = this.createApiClient(credentials);
    const currency = currencyFromExternalId(accountExternalId);

    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setMonth(defaultFrom.getMonth() - DEFAULT_SYNC_MONTHS);

    const transactions: ProviderTransaction[] = [];

    for await (const item of client.getHistoryIterator({
      currencies: [currency],
      dateFrom: (dateRange?.from ?? defaultFrom).toISOString(),
      dateTo: (dateRange?.to ?? now).toISOString(),
      itemLimit: 200,
      sortOrder: 'ASC',
    })) {
      transactions.push({
        externalId: item.transactionId,
        amount: Money.fromDecimal(Math.abs(parseFloat(item.operationAmount))).toCents(),
        currency: item.currency,
        date: new Date(item.ts),
        description: buildTransactionDescription(item),
        metadata: {
          historyItemId: item.historyItemId,
          transactionId: item.transactionId,
          operationType: item.operationType,
          operationDetailedType: item.operationDetailedType,
          operationDetails: item.operationDetails,
          balanceAfter: item.balanceAfter,
        },
      });
    }

    return transactions;
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
        throw new BadRequestError({ message: t({ key: 'bankDataProviders.walutomat.accountNoExternalId' }) });
      }

      const credentials = await this.getValidatedCredentials(connectionId);
      const client = this.createApiClient(credentials);
      const currency = currencyFromExternalId(account.externalId);

      // Determine sync start date
      const latestTransaction = await Transactions.findOne({
        where: { accountId: account.id },
        order: [['time', 'DESC']],
      });

      const now = new Date();
      let fromDate: Date;
      if (latestTransaction) {
        fromDate = new Date(latestTransaction.time);
      } else {
        fromDate = new Date(now);
        fromDate.setMonth(fromDate.getMonth() - DEFAULT_SYNC_MONTHS);
      }

      const historyItems: HistoryItem[] = [];
      try {
        for await (const item of client.getHistoryIterator({
          currencies: [currency],
          dateFrom: fromDate.toISOString(),
          dateTo: now.toISOString(),
          itemLimit: 200,
          sortOrder: 'ASC',
        })) {
          historyItems.push(item);
        }
        await this.resetAuthFailures(connectionId);
      } catch (error) {
        await this.handleAuthError({ connectionId, error });
        throw error;
      }

      const defaultCategoryId = await getUserDefaultCategory({ id: connection.userId });
      const createdTransactionIds: number[] = [];

      for (const item of historyItems) {
        // Primary dedup: check by originalId
        const existingTx = await Transactions.findOne({
          where: {
            accountId: account.id,
            originalId: item.transactionId,
          },
        });

        if (existingTx) {
          continue;
        }

        // Secondary dedup: check externalData.originalSource.originalId
        // Covers the unlink→relink flow where originalId was cleared
        const existingByOriginalSource = await Transactions.findOne({
          where: Sequelize.and(
            { accountId: account.id, originalId: null },
            Sequelize.where(Sequelize.literal(`"externalData"#>>'{originalSource,originalId}'`), item.transactionId),
          ),
        });

        if (existingByOriginalSource) {
          await existingByOriginalSource.update({ originalId: item.transactionId });
          continue;
        }

        const operationAmount = parseFloat(item.operationAmount);
        const isExpense = operationAmount < 0;

        const [createdTx] = await createTransaction({
          originalId: item.transactionId,
          note: buildTransactionDescription(item),
          amount: Money.fromDecimal(Math.abs(operationAmount)),
          time: new Date(item.ts),
          externalData: {
            historyItemId: item.historyItemId,
            transactionId: item.transactionId,
            operationType: item.operationType,
            operationDetailedType: item.operationDetailedType,
            operationDetails: item.operationDetails,
            balanceAfter: item.balanceAfter,
          },
          commissionRate: Money.fromCents(0),
          cashbackAmount: Money.fromCents(0),
          accountId: account.id,
          userId: connection.userId,
          transactionType: isExpense ? TRANSACTION_TYPES.expense : TRANSACTION_TYPES.income,
          paymentType: PAYMENT_TYPES.bankTransfer,
          categoryId: defaultCategoryId,
          transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
          accountType: ACCOUNT_TYPES.walutomat,
        });

        createdTransactionIds.push(createdTx.id);
      }

      if (createdTransactionIds.length > 0) {
        logger.info(`[Walutomat] Sync: ${createdTransactionIds.length} transactions created for account ${account.id}`);
      }

      // Update account balance
      try {
        const balances = await client.getBalances();
        const wallet = balances.find((b) => b.currency === currency);
        if (wallet) {
          const balanceMoney = Money.fromDecimal(parseFloat(wallet.balanceAvailable));
          await account.update({ currentBalance: balanceMoney });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.warn(`[Walutomat] Failed to update balance for account ${account.id}: ${errorMsg}`);
      }

      await this.updateLastSync(connectionId);

      emitTransactionsSyncEvent({
        userId: connection.userId,
        accountId: account.id,
        transactionIds: createdTransactionIds,
      });

      // Auto-link FX trade pairs as transfers across walutomat wallets
      await this.linkFxTransfers({ userId: connection.userId });

      await setAccountSyncStatus({ accountId: systemAccountId, status: SyncStatus.COMPLETED, userId });
    } catch (error) {
      logger.error({ message: '[Walutomat] Sync error:', error: error as Error });
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
    const credentials = await this.getValidatedCredentials(connectionId);
    const client = this.createApiClient(credentials);
    const currency = currencyFromExternalId(accountExternalId);

    const balances = await client.getBalances();
    const wallet = balances.find((b) => b.currency === currency);

    if (!wallet) {
      throw new BadRequestError({
        message: t({ key: 'bankDataProviders.walutomat.walletNotFound', variables: { currency } }),
      });
    }

    return {
      amount: Money.fromDecimal(parseFloat(wallet.balanceAvailable)).toCents(),
      currency: wallet.currency,
      asOf: new Date(),
    };
  }

  async refreshBalance(connectionId: number, systemAccountId: number): Promise<void> {
    const account = await this.getSystemAccount(systemAccountId);

    if (!account.externalId) {
      throw new BadRequestError({ message: t({ key: 'bankDataProviders.walutomat.accountNoExternalId' }) });
    }

    const balance = await this.fetchBalance(connectionId, account.externalId);

    await account.update({
      currentBalance: balance.amount,
    });
  }

  // ============================================================================
  // Auth Failure Handling
  // ============================================================================

  private async handleAuthError({ connectionId, error }: { connectionId: number; error: unknown }): Promise<void> {
    const isAuthError =
      error instanceof ForbiddenError ||
      (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403));

    if (!isAuthError) return;

    try {
      const connection = await this.getConnection(connectionId);
      const metadata = (connection.metadata as WalutomatMetadata) || {};
      const failures = (metadata.consecutiveAuthFailures || 0) + 1;
      metadata.consecutiveAuthFailures = failures;

      if (failures >= 2) {
        connection.isActive = false;
        metadata.deactivationReason = 'auth_failure';
        logger.warn(`[Walutomat] Connection ${connectionId} deactivated after ${failures} consecutive auth failures`);
      }

      connection.metadata = metadata as any;
      await connection.save();
    } catch (metaError) {
      logger.error({
        message: '[Walutomat] Failed to update auth failure metadata:',
        error: metaError as Error,
      });
    }
  }

  private async resetAuthFailures(connectionId: number): Promise<void> {
    try {
      const connection = await this.getConnection(connectionId);
      const metadata = (connection.metadata as WalutomatMetadata) || {};

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
  // FX Transfer Auto-Linking
  // ============================================================================

  /**
   * Auto-link MARKET_FX and DIRECT_FX transactions as transfers.
   *
   * FX trades in Walutomat create two history entries with the SAME transactionId
   * (used as originalId) — one income in the bought currency wallet and one expense
   * in the sold currency wallet. This method finds unlinked pairs and links them
   * as transfers using the existing linkTransactions service.
   */
  private async linkFxTransfers({ userId }: { userId: number }): Promise<void> {
    try {
      // Find all unlinked MARKET_FX and DIRECT_FX walutomat transactions for this user
      const unlinkedFxTxs = await Transactions.findAll({
        where: {
          userId,
          accountType: ACCOUNT_TYPES.walutomat,
          transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
          originalId: { [Op.not]: null },
          [Op.or]: [
            Sequelize.where(Sequelize.literal(`"externalData"->>'operationType'`), 'MARKET_FX'),
            Sequelize.where(Sequelize.literal(`"externalData"->>'operationType'`), 'DIRECT_FX'),
          ],
        },
      });

      if (unlinkedFxTxs.length === 0) return;

      // Group by originalId to find matching pairs
      const groups = new Map<string, Transactions[]>();
      for (const tx of unlinkedFxTxs) {
        if (!tx.originalId) continue;
        const existing = groups.get(tx.originalId);
        if (existing) {
          existing.push(tx);
        } else {
          groups.set(tx.originalId, [tx]);
        }
      }

      // Collect valid pairs for linking
      const pairsToLink: [number, number][] = [];

      for (const [, txs] of groups) {
        // Only link complete pairs (exactly 2 transactions)
        if (txs.length !== 2) continue;

        const [a, b] = txs as [Transactions, Transactions];

        // Must be in different accounts with opposite transaction types
        if (a.accountId === b.accountId) continue;
        if (a.transactionType === b.transactionType) continue;

        // Determine which is the expense (base) and which is the income (opposite)
        const [baseTx, oppositeTx] = a.transactionType === TRANSACTION_TYPES.expense ? [a, b] : [b, a];

        pairsToLink.push([baseTx.id, oppositeTx.id]);
      }

      if (pairsToLink.length === 0) return;

      await linkTransactions({ userId, ids: pairsToLink });

      logger.info(`[Walutomat] Auto-linked ${pairsToLink.length} FX transfer pair(s) for user ${userId}`);
    } catch (error) {
      // Non-critical — don't fail the sync if linking fails
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`[Walutomat] Failed to auto-link FX transfers: ${errorMsg}`);
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private createApiClient(credentials: WalutomatCredentials): WalutomatApiClient {
    return new WalutomatApiClient({
      apiKey: credentials.apiKey,
      privateKey: credentials.privateKey,
    });
  }

  private isValidCredentials(credentials: unknown): credentials is WalutomatCredentials {
    if (typeof credentials !== 'object' || credentials === null) {
      return false;
    }
    const creds = credentials as Record<string, unknown>;
    return (
      typeof creds.apiKey === 'string' &&
      creds.apiKey.length > 0 &&
      typeof creds.privateKey === 'string' &&
      creds.privateKey.length > 0
    );
  }

  private async getValidatedCredentials(connectionId: number): Promise<WalutomatCredentials> {
    const credentials = await this.getDecryptedCredentials(connectionId);
    if (!this.isValidCredentials(credentials)) {
      throw new ValidationError({
        message: t({ key: 'bankDataProviders.walutomat.invalidCredentialsFormat' }),
      });
    }
    return credentials;
  }
}
