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
import { BadRequestError, ForbiddenError, NotFoundError, ValidationError } from '@js/errors';
import { logger } from '@js/utils';
import Accounts from '@models/Accounts.model';
import Balances from '@models/Balances.model';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import Transactions from '@models/Transactions.model';
import { getUserDefaultCategory } from '@models/Users.model';
import { calculateRefAmount } from '@root/services/calculate-ref-amount.service';
import {
  BaseBankDataProvider,
  DateRange,
  ProviderAccount,
  ProviderBalance,
  ProviderMetadata,
  ProviderTransaction,
} from '@services/bank-data-providers';
import { createTransaction } from '@services/transactions';
import crypto from 'crypto';
import { startOfDay } from 'date-fns';

import { SyncStatus, setAccountSyncStatus } from '../sync/sync-status-tracker';
import { encryptCredentials } from '../utils/credential-encryption';
import { emitTransactionsSyncEvent } from '../utils/emit-transactions-sync-event';
import { EnableBankingApiClient } from './api-client';
import { generateState, validatePrivateKey, validateState } from './jwt-utils';
import {
  CreditDebitIndicator,
  EnableBankingAccount,
  EnableBankingConnectionParams,
  EnableBankingCredentials,
  EnableBankingMetadata,
  EnableBankingTransaction,
  OAuthCallbackParams,
  PSUType,
  StartAuthorizationResponse,
} from './types';

/**
 * Enable Banking provider implementation
 * Handles integration with Enable Banking API for multi-bank account access across Europe
 * Supports 6000+ banks via PSD2
 */
export class EnableBankingProvider extends BaseBankDataProvider {
  readonly metadata: ProviderMetadata = {
    type: BANK_PROVIDER_TYPE.ENABLE_BANKING,
    name: 'Enable Banking',
    description: 'Access 6000+ European banks via PSD2 open banking',
    features: {
      supportsWebhooks: false,
      supportsRealtime: false,
      requiresReauth: true, // Sessions expire after consent period
      supportsManualSync: true,
      supportsAutoSync: true,
      defaultSyncInterval: 24 * 60 * 60 * 1000, // 24 hours
      minSyncInterval: 5 * 60 * 1000, // 5 minutes
    },
  };

  // ============================================================================
  // Connection Management
  // ============================================================================

  /**
   * Start connection flow - returns authorization URL for user
   * Full connection is completed via handleOAuthCallback()
   */
  async connect(userId: number, credentials: unknown): Promise<number> {
    if (!this.isValidConnectionParams(credentials)) {
      throw new ValidationError({ message: t({ key: 'bankDataProviders.enableBanking.invalidCredentialsFormat' }) });
    }

    const { appId, privateKey, bankName, bankCountry, redirectUrl, maxConsentValidity } = credentials;

    // Validate private key format
    if (!validatePrivateKey(privateKey)) {
      throw new ValidationError({ message: t({ key: 'bankDataProviders.enableBanking.invalidRsaKey' }) });
    }

    // Create initial credentials object (without session yet)
    const initialCredentials: EnableBankingCredentials = {
      appId,
      privateKey,
    };

    // Test connection to Enable Banking API
    const apiClient = new EnableBankingApiClient(initialCredentials);
    const isValid = await this.validateCredentials(initialCredentials);
    if (!isValid) {
      throw new ForbiddenError({ message: t({ key: 'bankDataProviders.enableBanking.invalidCredentials' }) });
    }

    // Generate OAuth state for CSRF protection
    const state = generateState(userId);

    // Calculate consent validity period
    const consentValidFrom = new Date();
    const consentValidUntil = this.calculateConsentValidUntil(maxConsentValidity);

    // Start authorization flow
    const authResponse = await this.startAuthorizationFlow(
      apiClient,
      bankName,
      bankCountry,
      redirectUrl || process.env.ENABLE_BANKING_REDIRECT_URL || 'http://localhost:8100/bank-callback',
      state,
      consentValidUntil,
    );

    // Create pending connection in database
    const connection = await BankDataProviderConnections.create({
      userId,
      providerType: this.metadata.type,
      providerName: `${bankName} (${bankCountry})`,
      isActive: false, // Will be activated after OAuth callback
      credentials: encryptCredentials({
        appId,
        privateKey,
        authorizationId: authResponse.authorization_id,
      }),
      metadata: {
        bankName,
        bankCountry,
        state,
        authUrl: authResponse.url,
        consentValidFrom: consentValidFrom.toISOString(),
        consentValidUntil: consentValidUntil.toISOString(),
        bankMaxConsentValidity: maxConsentValidity,
      } as EnableBankingMetadata,
    } as any);

    // Store auth URL in connection for retrieval
    // Return both connection ID and auth URL (frontend needs URL)
    return connection.id;
  }

  /**
   * Get authorization URL for a pending connection
   * Used by frontend to redirect user to bank
   */
  async getAuthorizationUrl(connectionId: number): Promise<string> {
    const connection = await this.getConnection(connectionId);
    this.validateProviderType(connection);

    const metadata = connection.metadata as unknown as EnableBankingMetadata;

    if (!metadata.authUrl) {
      throw new BadRequestError({ message: t({ key: 'bankDataProviders.enableBanking.authUrlNotFound' }) });
    }

    return metadata.authUrl;
  }

  /**
   * Complete OAuth flow after user authorization
   * Should be called from callback endpoint
   */
  async handleOAuthCallback(connectionId: number, callbackParams: OAuthCallbackParams): Promise<void> {
    const connection = await this.getConnection(connectionId);
    this.validateProviderType(connection);

    const metadata = connection.metadata as unknown as EnableBankingMetadata;

    // Validate state parameter
    if (!metadata.state || callbackParams.state !== metadata.state) {
      throw new ValidationError({ message: t({ key: 'bankDataProviders.enableBanking.invalidOAuthState' }) });
    }

    if (!validateState(callbackParams.state, connection.userId)) {
      throw new ValidationError({ message: t({ key: 'bankDataProviders.enableBanking.oAuthStateExpired' }) });
    }

    // Check for OAuth errors
    if (callbackParams.error) {
      throw new BadRequestError({
        message: t({
          key: 'bankDataProviders.enableBanking.oAuthAuthorizationFailed',
          variables: { error: callbackParams.error_description || callbackParams.error },
        }),
      });
    }

    // Get credentials
    const credentials = (await this.getDecryptedCredentials(connectionId)) as unknown as EnableBankingCredentials;
    const apiClient = new EnableBankingApiClient(credentials);

    // Exchange code for session
    const sessionResponse = await apiClient.createSession({
      code: callbackParams.code,
    });

    // Update connection with session info
    credentials.sessionId = sessionResponse.session_id;
    connection.setEncryptedCredentials(credentials as unknown as Record<string, unknown>);

    // Calculate consent validity - consent is now active after successful OAuth
    const consentValidFrom = new Date();
    const consentValidUntil = this.calculateConsentValidUntil(metadata.bankMaxConsentValidity);

    // Update metadata with account summaries and consent dates
    // Store all accounts including those without uid (blocked/closed accounts)
    // UI can check uid to show appropriate warnings
    const updatedMetadata: EnableBankingMetadata = {
      ...metadata,
      accounts: sessionResponse.accounts.map((account) => ({
        identification_hash: account.identification_hash,
        uid: account.uid,
        iban: account.account_id?.iban,
        currency: account.currency,
        name: account.name || account.owner_name,
      })),
      state: undefined, // Clear state after successful auth
      consentValidFrom: consentValidFrom.toISOString(),
      consentValidUntil: consentValidUntil.toISOString(),
    };
    connection.metadata = updatedMetadata;
    connection.isActive = true;

    await connection.save();

    // Update externalId for existing accounts after reconnection
    // Enable Banking assigns new UUIDs after each authorization, but IBAN stays the same
    await this.updateExistingAccountExternalIds({
      connectionId,
      userId: connection.userId,
      newAccounts: sessionResponse.accounts,
    });
  }

  /**
   * Update existing accounts after reconnection.
   * Enable Banking assigns new UIDs after each authorization, but identification_hash stays the same.
   * This method:
   * 1. Matches accounts by IBAN + currency
   * 2. Updates externalData with new rawAccountData and uid (for API calls)
   * 3. Migrates transaction hashes if externalId changes (from old uid to identification_hash)
   * 4. Updates externalId to identification_hash (stable across sessions)
   */
  private async updateExistingAccountExternalIds({
    connectionId,
    userId,
    newAccounts,
  }: {
    connectionId: number;
    userId: number;
    newAccounts: EnableBankingAccount[];
  }): Promise<void> {
    // Get existing accounts for this connection
    const existingAccounts = await Accounts.findAll({
      where: {
        userId,
        bankDataProviderConnectionId: connectionId,
      },
    });

    if (existingAccounts.length === 0) {
      return; // No existing accounts to update
    }

    // Match and update existing accounts
    for (const existingAccount of existingAccounts) {
      const existingMetadata = existingAccount.externalData as Record<string, unknown> | null;
      const existingIban = existingMetadata?.iban as string | undefined;

      // Primary: match by identification_hash (externalId now stores this stable ID)
      let matchingNewAccount = newAccounts.find((newAcc) => newAcc.identification_hash === existingAccount.externalId);

      // Fallback: match by IBAN + currency (for legacy accounts where externalId was uid)
      if (!matchingNewAccount && existingIban) {
        matchingNewAccount = newAccounts.find(
          (newAcc) => newAcc.account_id?.iban === existingIban && newAcc.currency === existingAccount.currencyCode,
        );
      }

      if (!matchingNewAccount) {
        // No match found - account needs to be re-linked by user
        logger.warn(
          `Could not match existing account ${existingAccount.id} (${existingAccount.name}, ${existingAccount.currencyCode}). ` +
            `Account needs to be re-linked.`,
        );
        continue;
      }

      // The stable identifier we should use for externalId
      const newExternalId = matchingNewAccount.identification_hash;

      // Update externalData with fresh account data (including uid for API calls)
      const updatedMetadata = {
        ...existingMetadata,
        iban: matchingNewAccount.account_id?.iban,
        product: matchingNewAccount.product,
        ownerName: matchingNewAccount.owner_name,
        accountServicer: matchingNewAccount.account_servicer?.name,
        bic: matchingNewAccount.account_servicer?.bic_fi,
        uid: matchingNewAccount.uid, // Session-specific uid for API calls
        rawAccountData: matchingNewAccount, // Full account data
      };

      // Check if we need to migrate transaction hashes
      // This happens when externalId was previously set to uid (old behavior)
      // and now we're updating it to identification_hash (new stable identifier)
      if (existingAccount.externalId !== newExternalId) {
        await this.migrateTransactionHashes({
          account: existingAccount,
          newExternalId,
        });
        // Reload to get updated externalId
        await existingAccount.reload();
      }

      // Update externalData (always update to get fresh uid and rawAccountData)
      await existingAccount.update({
        externalData: updatedMetadata,
      });
    }
  }

  /**
   * Reauthorize an existing connection (renew consent without disconnecting)
   * Returns the new authorization URL for user to complete OAuth flow
   */
  async reauthorize(connectionId: number): Promise<string> {
    const connection = await this.getConnection(connectionId);
    this.validateProviderType(connection);

    const metadata = connection.metadata as unknown as EnableBankingMetadata;
    const credentials = (await this.getDecryptedCredentials(connectionId)) as unknown as EnableBankingCredentials;

    if (!metadata.bankName || !metadata.bankCountry) {
      throw new BadRequestError({ message: t({ key: 'bankDataProviders.enableBanking.bankInfoNotFound' }) });
    }

    // Mark connection as inactive IMMEDIATELY before any API calls
    // Once reauthorization starts, the old session becomes invalid at Enable Banking's side
    // Set consent end date to now so UI shows as expired with 0 days remaining
    const now = new Date().toISOString();
    connection.isActive = false;
    const expiredMetadata: EnableBankingMetadata = {
      ...metadata,
      consentValidUntil: now, // Expired now - UI will show 0 days remaining
    };
    connection.metadata = expiredMetadata as any;
    await connection.save();

    // Revoke existing session if it exists
    if (credentials.sessionId) {
      try {
        const apiClient = new EnableBankingApiClient(credentials);
        await apiClient.deleteSession(credentials.sessionId);
      } catch (error) {
        // Log but continue - session might already be expired
        console.error('Failed to revoke existing session during reauthorization:', error);
      }
    }

    // Generate new OAuth state
    const state = generateState(connection.userId);

    // Calculate consent validity period for the API request
    // The actual consent dates will be set in handleOAuthCallback() after OAuth completes
    const consentValidUntil = this.calculateConsentValidUntil(expiredMetadata.bankMaxConsentValidity);

    // Create API client with existing credentials
    const apiClient = new EnableBankingApiClient(credentials);

    // Start new authorization flow
    const authResponse = await this.startAuthorizationFlow(
      apiClient,
      metadata.bankName,
      metadata.bankCountry,
      process.env.ENABLE_BANKING_REDIRECT_URL || 'http://localhost:8100/bank-callback',
      state,
      consentValidUntil,
    );

    // Update connection credentials with new authorization ID, remove old session
    credentials.authorizationId = authResponse.authorization_id;
    credentials.sessionId = undefined;
    connection.setEncryptedCredentials(credentials as unknown as Record<string, unknown>);

    // Update metadata with new auth info
    // Note: consent dates are intentionally NOT set here - they should only be set
    // after OAuth completes successfully in handleOAuthCallback()
    const updatedMetadata: EnableBankingMetadata = {
      ...expiredMetadata, // Use cleared metadata (without consent dates)
      state,
      authUrl: authResponse.url,
    };
    connection.metadata = updatedMetadata;

    await connection.save();

    return authResponse.url;
  }

  async disconnect(connectionId: number): Promise<void> {
    const connection = await this.getConnection(connectionId);
    this.validateProviderType(connection);

    // Try to revoke session at Enable Banking
    try {
      const credentials = (await this.getDecryptedCredentials(connectionId)) as unknown as EnableBankingCredentials;
      if (credentials.sessionId) {
        const apiClient = new EnableBankingApiClient(credentials);
        await apiClient.deleteSession(credentials.sessionId);
      }
    } catch (error) {
      // Log error but continue with disconnection
      console.error('Failed to revoke Enable Banking session:', error);
    }

    // Delete the connection (CASCADE will handle related accounts)
    await connection.destroy();
  }

  async validateCredentials(credentials: unknown): Promise<boolean> {
    if (!this.isValidCredentials(credentials)) {
      return false;
    }

    const { appId, privateKey } = credentials;

    // Validate private key format
    if (!validatePrivateKey(privateKey)) {
      return false;
    }

    const apiClient = new EnableBankingApiClient({ appId, privateKey });

    try {
      return await apiClient.testConnection();
    } catch (error) {
      return false;
    }
  }

  async refreshCredentials(connectionId: number, newCredentials: unknown): Promise<void> {
    if (!this.isValidCredentials(newCredentials)) {
      throw new ValidationError({ message: t({ key: 'bankDataProviders.enableBanking.invalidCredentialsFormat' }) });
    }

    const connection = await this.getConnection(connectionId);
    this.validateProviderType(connection);

    // Validate new credentials
    const isValid = await this.validateCredentials(newCredentials);
    if (!isValid) {
      throw new ForbiddenError({ message: t({ key: 'bankDataProviders.enableBanking.invalidCredentials' }) });
    }

    // Get existing session ID if any
    const existingCreds = (await this.getDecryptedCredentials(connectionId)) as unknown as EnableBankingCredentials;

    // Update credentials while preserving session
    const updatedCredentials: EnableBankingCredentials = {
      ...(newCredentials as EnableBankingCredentials),
      sessionId: existingCreds.sessionId,
    };

    connection.setEncryptedCredentials(updatedCredentials as unknown as Record<string, unknown>);
    await connection.save();
  }

  // ============================================================================
  // Account Operations
  // ============================================================================

  async fetchAccounts(connectionId: number): Promise<ProviderAccount[]> {
    const connection = await this.getConnection(connectionId);
    this.validateProviderType(connection);

    const credentials = await this.getValidatedCredentials(connectionId);

    if (!credentials.sessionId) {
      throw new BadRequestError({ message: t({ key: 'bankDataProviders.enableBanking.noActiveSession' }) });
    }

    const apiClient = new EnableBankingApiClient(credentials);
    const session = await apiClient.getSession(credentials.sessionId);

    // Fetch all account details and balances in parallel
    const accountsData = await Promise.all(
      session.accounts.map(async (accountId) => {
        const [details, balances] = await Promise.all([
          apiClient.getAccountDetails(accountId),
          apiClient.getAccountBalances(accountId),
        ]);

        // Get primary balance (prefer ITAV = Interim Available, then ITBD = Interim Booked)
        const primaryBalance =
          balances.find((b) => b.balance_type === 'ITAV') || // Interim Available
          balances.find((b) => b.balance_type === 'ITBD') || // Interim Booked
          balances.find((b) => b.balance_type === 'CLAV') || // Closing Available
          balances.find((b) => b.balance_type === 'OPAV') || // Opening Available
          balances[0];

        // Convert balance from string to system amount (cents as integer)
        const balanceFloat = primaryBalance?.balance_amount ? parseFloat(primaryBalance.balance_amount.amount) : 0;
        const balanceSystemAmount = Money.fromDecimal(balanceFloat).toCents();

        return {
          externalId: details.identification_hash,
          name:
            details.name ||
            details.details ||
            details.product ||
            `Account ${details.account_id?.iban?.slice(-4) || accountId.slice(-4)}`,
          type: 'debit' as const, // Enable Banking doesn't distinguish, default to debit
          balance: balanceSystemAmount,
          currency: details.currency,
          metadata: {
            iban: details.account_id?.iban,
            product: details.product,
            ownerName: details.owner_name,
            accountServicer: details.account_servicer?.name,
            bic: details.account_servicer?.bic_fi,
            // Store the session-specific uid for API calls (balances, transactions)
            uid: details.uid,
            // Store complete raw payload for future reference and migrations
            rawAccountData: details,
          },
        };
      }),
    );

    return accountsData;
  }

  // ============================================================================
  // Transaction Operations
  // ============================================================================

  /**
   * Fetch transactions from Enable Banking API
   * @param connectionId - Connection ID
   * @param accountApiUid - Session-specific uid for API calls
   * @param dateRange - Optional date range filter
   * @param accountExternalIdForHash - Stable identifier for hash generation (defaults to accountApiUid for backward compatibility)
   */
  async fetchTransactions(
    connectionId: number,
    accountApiUid: string,
    dateRange?: DateRange,
    accountExternalIdForHash?: string,
  ): Promise<ProviderTransaction[]> {
    const credentials = await this.getValidatedCredentials(connectionId);

    if (!credentials.sessionId) {
      throw new BadRequestError({ message: t({ key: 'bankDataProviders.enableBanking.noActiveSessionGeneric' }) });
    }

    const apiClient = new EnableBankingApiClient(credentials);

    // Use the stable externalId for hashing (identification_hash), or fall back to apiUid for backward compatibility
    const hashId = accountExternalIdForHash || accountApiUid;

    // Get all transactions for the date range
    const transactions = await apiClient.getAllTransactions(accountApiUid, {
      date_from: dateRange?.from?.toISOString().split('T')[0],
      date_to: dateRange?.to?.toISOString().split('T')[0],
    });

    return transactions.map((tx) => {
      const isExpense = tx.credit_debit_indicator === CreditDebitIndicator.DBIT;
      const amountFloat = parseFloat(tx.transaction_amount.amount);
      const amountSystemAmount = Money.fromDecimal(amountFloat).toCents();
      const merchantName = tx.debtor?.name || tx.creditor?.name || 'Unknown';

      // Generate unique hash from transaction data
      // Use stable externalId (identification_hash) for hashing, not session-specific uid
      const uniqueId = this.generateTransactionHash({ tx, accountExternalId: hashId });

      // Get the transaction date using priority-based selection
      const transactionDateString = this.getTransactionDateString(tx);
      const transactionDate = transactionDateString ? new Date(transactionDateString) : new Date();

      return {
        externalId: uniqueId,
        amount: amountSystemAmount,
        currency: tx.transaction_amount.currency,
        date: transactionDate,
        description: tx.remittance_information?.join(' ') || 'Transaction',
        merchantName,
        metadata: {
          // Parsed/extracted fields for easy access
          transactionDate: tx.transaction_date,
          valueDate: tx.value_date,
          bookingDate: tx.booking_date,
          debtorName: tx.debtor?.name || null,
          debtorAccount: tx.debtor_account?.iban,
          creditorName: tx.creditor?.name || null,
          creditorAccount: tx.creditor_account?.iban,
          balanceAfter: tx.balance_after_transaction,
          oritinalAmount: parseFloat(tx.transaction_amount.amount),
          isExpense, // Store transaction type indicator
          entryReference: tx.entry_reference,
          originalTransactionId: tx.transaction_id, // Store if available

          // Store complete raw payload for future reference and debugging
          rawTransaction: tx,
        },
      };
    });
  }

  /**
   * Sync transactions for an account (direct sync, no queue)
   */
  async syncTransactions({
    connectionId,
    systemAccountId,
    userId,
  }: {
    connectionId: number;
    systemAccountId: number;
    userId: number;
  }): Promise<void> {
    // Set status to SYNCING
    await setAccountSyncStatus({ accountId: systemAccountId, status: SyncStatus.SYNCING, userId });

    try {
      const account = await this.getSystemAccount(systemAccountId);
      const connection = await this.getConnection(connectionId);
      this.validateProviderType(connection);

      if (!account.externalId) {
        throw new BadRequestError({ message: t({ key: 'accounts.accountNoExternalIdEnableBanking' }) });
      }

      // Get metadata for API calls and migrations
      let metadata = account.externalData as Record<string, unknown> | null;
      let rawAccountData = metadata?.rawAccountData as EnableBankingAccount | undefined;

      // Check if we need to refresh account metadata from the API
      // This happens for accounts created before rawAccountData/uid were stored
      const needsMetadataRefresh = !rawAccountData || !metadata?.uid;

      if (needsMetadataRefresh) {
        logger.info(`Account ${account.id} is missing rawAccountData or uid, refreshing from API...`);
        const freshAccountData = await this.refreshAccountMetadata({ connectionId, account });
        if (freshAccountData) {
          // Reload account to get updated externalData
          await account.reload();
          metadata = account.externalData as Record<string, unknown> | null;
          rawAccountData = metadata?.rawAccountData as EnableBankingAccount | undefined;
        }
      }

      // Get uid from metadata for API calls (session-specific)
      // Fall back to externalId for backward compatibility
      const apiUid = (metadata?.uid as string) || account.externalId;

      // Check if we need to migrate transaction hashes
      // This happens when account was created with uid as externalId but now has identification_hash available
      if (rawAccountData?.identification_hash && account.externalId !== rawAccountData.identification_hash) {
        await this.migrateTransactionHashes({
          account,
          newExternalId: rawAccountData.identification_hash,
        });
        // Reload account to get updated externalId
        await account.reload();
      }

      // Find the most recent transaction
      const latestTransaction = await Transactions.findOne({
        where: { accountId: account.id },
        order: [['time', 'DESC']],
      });

      // Default to last 3 years if no transactions found
      const days = 1095;
      const from = latestTransaction
        ? new Date(latestTransaction.time)
        : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const to = new Date();

      // Fetch transactions using uid for API calls, but externalId (identification_hash) for hashing
      const providerTransactions = await this.fetchTransactions(connectionId, apiUid, { from, to }, account.externalId);

      // Sort transactions by date (ascending) so the last transaction for each day
      // will have the correct end-of-day balance in balance_after_transaction.
      // This is important for Balances.handleTransactionChange() which uses the
      // balance from the last-processed transaction for each date.
      providerTransactions.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Process each transaction and collect created/updated transaction IDs
      const createdTransactionIds: number[] = [];
      let updatedCount = 0;

      for (const tx of providerTransactions) {
        // Check if transaction already exists
        const existingTx = await Transactions.findOne({
          where: {
            accountId: account.id,
            originalId: tx.externalId,
          },
        });

        if (existingTx) {
          // Check if booking_date appeared (wasn't there before but is now)
          // This handles cases where dates are progressively populated by the bank
          const existingBookingDate = (existingTx.externalData as typeof tx.metadata)?.bookingDate;
          const newBookingDate = tx.metadata?.bookingDate;
          const bookingDateAppeared = !existingBookingDate && newBookingDate;

          if (bookingDateAppeared) {
            await existingTx.update({
              time: tx.date, // Update to best available date
              externalData: tx.metadata, // Update with latest payload including bookingDate
            });
            updatedCount++;
          }
          continue;
        }

        // Determine transaction type from metadata
        const isExpense = tx.metadata?.isExpense === true;

        const { defaultCategoryId } = (await getUserDefaultCategory({ id: connection.userId }))!;

        // TODO: consider creating transactions in batch?
        // Create transaction using service (handles all required fields)
        const [createdTx] = await createTransaction({
          originalId: tx.externalId,
          note: tx.description,
          amount: Money.fromCents(Math.abs(tx.amount)), // Ensure positive value
          time: tx.date,
          externalData: tx.metadata,
          commissionRate: Money.zero(),
          cashbackAmount: Money.zero(),
          accountId: account.id,
          userId: connection.userId,
          transactionType: isExpense ? TRANSACTION_TYPES.expense : TRANSACTION_TYPES.income,
          paymentType: PAYMENT_TYPES.bankTransfer,
          categoryId: defaultCategoryId,
          transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
          accountType: ACCOUNT_TYPES.enableBanking,
        });

        createdTransactionIds.push(createdTx.id);
      }

      // Log sync stats
      if (createdTransactionIds.length > 0 || updatedCount > 0) {
        logger.info(
          `Enable Banking sync: ${createdTransactionIds.length} created, ${updatedCount} updated for account ${account.id}`,
        );
      }

      // Always update account balance from bank when syncing
      // This ensures balance stays accurate even if no new transactions were found
      const balance = await this.fetchBalance(connectionId, apiUid);
      await this.updateAccountBalance({ account, balance: balance.amount });

      await this.updateLastSync(connectionId);

      // Emit event for downstream services (e.g., AI categorization)
      emitTransactionsSyncEvent({
        userId: connection.userId,
        accountId: account.id,
        transactionIds: createdTransactionIds,
      });

      // Set status to COMPLETED on success
      await setAccountSyncStatus({ accountId: systemAccountId, status: SyncStatus.COMPLETED, userId });
    } catch (error) {
      console.error('Enable Banking sync error:', error);
      // Set status to FAILED on error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await setAccountSyncStatus({
        accountId: systemAccountId,
        status: SyncStatus.FAILED,
        error: errorMessage,
        userId,
      });
      throw error; // Re-throw to maintain existing error handling
    }
  }

  // ============================================================================
  // Balance Operations
  // ============================================================================

  async fetchBalance(connectionId: number, accountExternalId: string): Promise<ProviderBalance> {
    const credentials = await this.getValidatedCredentials(connectionId);

    if (!credentials.sessionId) {
      throw new BadRequestError({ message: t({ key: 'bankDataProviders.enableBanking.noActiveSessionGeneric' }) });
    }

    const apiClient = new EnableBankingApiClient(credentials);
    const balances = await apiClient.getAccountBalances(accountExternalId);

    // Prefer ITAV (Interim Available), then ITBD (Interim Booked)
    const balance =
      balances.find((b) => b.balance_type === 'ITAV') ||
      balances.find((b) => b.balance_type === 'ITBD') ||
      balances.find((b) => b.balance_type === 'CLAV') ||
      balances[0];

    if (!balance) {
      throw new NotFoundError({ message: t({ key: 'bankDataProviders.enableBanking.noBalanceInfo' }) });
    }

    const balanceFloat = parseFloat(balance.balance_amount.amount);
    const balanceSystemAmount = Money.fromDecimal(balanceFloat).toCents();

    return {
      amount: balanceSystemAmount,
      currency: balance.balance_amount.currency,
      asOf: balance.reference_date ? new Date(balance.reference_date) : new Date(),
    };
  }

  async refreshBalance(connectionId: number, systemAccountId: number): Promise<void> {
    const account = await this.getSystemAccount(systemAccountId);

    if (!account.externalId) {
      throw new BadRequestError({ message: t({ key: 'accounts.accountNoExternalId' }) });
    }

    // Get uid from metadata for API calls (session-specific)
    // Fall back to externalId for backward compatibility
    const metadata = account.externalData as Record<string, unknown> | null;
    const apiUid = (metadata?.uid as string) || account.externalId;

    const balance = await this.fetchBalance(connectionId, apiUid);

    await this.updateAccountBalance({ account, balance: balance.amount });
  }

  /**
   * Update account balance and record it in balance history.
   * This ensures both currentBalance/refCurrentBalance and the Balances table are in sync.
   */
  private async updateAccountBalance({ account, balance }: { account: Accounts; balance: number }): Promise<void> {
    const today = startOfDay(new Date());

    // Calculate ref balance (in user's base currency)
    const refBalance = await calculateRefAmount({
      amount: Money.fromCents(balance),
      userId: account.userId,
      date: today,
      baseCode: account.currencyCode,
    });

    // Update account balance
    await account.update({
      currentBalance: balance,
      refCurrentBalance: refBalance,
    });

    // Update balance history using centralized Balances model method
    await Balances.updateAccountBalance({
      accountId: account.id,
      date: today,
      refBalance,
    });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Start OAuth authorization flow
   */
  private async startAuthorizationFlow(
    apiClient: EnableBankingApiClient,
    bankName: string,
    bankCountry: string,
    redirectUrl: string,
    state: string,
    validUntil: Date,
  ): Promise<StartAuthorizationResponse> {
    return await apiClient.startAuthorization({
      access: {
        valid_until: validUntil.toISOString(),
      },
      aspsp: {
        name: bankName,
        country: bankCountry,
      },
      state,
      redirect_url: redirectUrl,
      psu_type: PSUType.Personal,
    });
  }

  /**
   * Calculate consent validity end date based on bank's maximum
   */
  private calculateConsentValidUntil(bankMaxConsentValidity: number | undefined = 90 * 24 * 60 * 60): Date {
    const consentValiditySeconds = bankMaxConsentValidity;

    return new Date(Date.now() + consentValiditySeconds * 1000);
  }

  /**
   * Type guard for connection parameters
   */
  private isValidConnectionParams(credentials: unknown): credentials is EnableBankingConnectionParams {
    const creds = credentials as EnableBankingConnectionParams;
    return (
      typeof creds === 'object' &&
      creds !== null &&
      typeof creds.appId === 'string' &&
      typeof creds.privateKey === 'string' &&
      typeof creds.bankName === 'string' &&
      typeof creds.bankCountry === 'string'
    );
  }

  /**
   * Type guard for credentials
   */
  private isValidCredentials(credentials: unknown): credentials is EnableBankingCredentials {
    const creds = credentials as EnableBankingCredentials;
    return (
      typeof creds === 'object' &&
      creds !== null &&
      typeof creds.appId === 'string' &&
      typeof creds.privateKey === 'string'
    );
  }

  /**
   * Get and validate credentials
   */
  private async getValidatedCredentials(connectionId: number): Promise<EnableBankingCredentials> {
    const credentials = (await this.getDecryptedCredentials(connectionId)) as unknown as EnableBankingCredentials;

    if (!this.isValidCredentials(credentials)) {
      throw new ValidationError({ message: t({ key: 'bankDataProviders.enableBanking.invalidStoredCredentials' }) });
    }

    return credentials;
  }

  /**
   * Refresh account metadata from Enable Banking API.
   * This is used to update rawAccountData and uid for accounts that were created
   * before these fields were stored, or when the session has been refreshed.
   *
   * @param connectionId - The connection ID
   * @param account - The account to refresh
   * @returns The fresh account data from the API, or null if not found
   */
  private async refreshAccountMetadata({
    connectionId,
    account,
  }: {
    connectionId: number;
    account: Accounts;
  }): Promise<EnableBankingAccount | null> {
    const credentials = await this.getValidatedCredentials(connectionId);

    if (!credentials.sessionId) {
      logger.warn(`Cannot refresh account metadata: no active session for connection ${connectionId}`);
      return null;
    }

    const apiClient = new EnableBankingApiClient(credentials);

    // Get the current session to find matching account
    const session = await apiClient.getSession(credentials.sessionId);

    // Get existing metadata for matching
    const existingMetadata = account.externalData as Record<string, unknown> | null;
    const existingIban = existingMetadata?.iban as string | undefined;

    // Fetch details for all accounts in session to find match
    const accountsDetails = await Promise.all(
      session.accounts.map(async (accountUid) => {
        try {
          return await apiClient.getAccountDetails(accountUid);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn(`Failed to fetch details for account uid ${accountUid}: ${errorMessage}`);
          return null;
        }
      }),
    );

    // Filter out null results
    const validAccountsDetails = accountsDetails.filter((d): d is EnableBankingAccount => d !== null);

    // Primary: match by identification_hash (externalId now stores this stable ID)
    let matchingAccount = validAccountsDetails.find((details) => details.identification_hash === account.externalId);

    // Fallback: match by IBAN + currency (for legacy accounts where externalId was uid)
    if (!matchingAccount && existingIban) {
      matchingAccount = validAccountsDetails.find(
        (details) => details.account_id?.iban === existingIban && details.currency === account.currencyCode,
      );
    }

    if (!matchingAccount) {
      // No match found - account needs to be re-linked by user
      logger.warn(
        `Could not find matching account in session for account ${account.id} ` +
          `(${account.name}, ${account.currencyCode}). Account needs to be re-linked.`,
      );
      return null;
    }

    // Update account's externalData with fresh metadata
    const updatedMetadata = {
      ...existingMetadata,
      iban: matchingAccount.account_id?.iban,
      product: matchingAccount.product,
      ownerName: matchingAccount.owner_name,
      accountServicer: matchingAccount.account_servicer?.name,
      bic: matchingAccount.account_servicer?.bic_fi,
      uid: matchingAccount.uid, // Session-specific uid for API calls
      rawAccountData: matchingAccount, // Full account data
    };

    await account.update({ externalData: updatedMetadata });

    logger.info(`Refreshed account metadata for account ${account.id} (uid: ${matchingAccount.uid})`);

    return matchingAccount;
  }

  /**
   * Migrate transaction hashes when account externalId changes.
   * This recalculates all transaction originalIds using the new externalId.
   *
   * @param account - The account whose transactions need migration
   * @param newExternalId - The new externalId (identification_hash)
   * @returns Number of transactions migrated
   *
   * @deprecated Temporary migration for legacy accounts (pre-identification_hash).
   * Can be removed once all accounts have been migrated to use identification_hash as externalId.
   */
  private async migrateTransactionHashes({
    account,
    newExternalId,
  }: {
    account: Accounts;
    newExternalId: string;
  }): Promise<number> {
    // Skip if externalId hasn't changed
    if (account.externalId === newExternalId) {
      return 0;
    }

    logger.info(
      `Migrating transaction hashes for account ${account.id} from ${account.externalId} to ${newExternalId}`,
    );

    // Get all transactions for this account
    const transactions = await Transactions.findAll({
      where: { accountId: account.id },
    });

    let migratedCount = 0;

    for (const tx of transactions) {
      const rawTransaction = (tx.externalData as Record<string, unknown>)?.rawTransaction as
        | EnableBankingTransaction
        | undefined;

      if (!rawTransaction) {
        logger.warn(`Transaction ${tx.id} has no rawTransaction in externalData, skipping migration`);
        continue;
      }

      // Calculate new hash using the new externalId (identification_hash)
      const newOriginalId = this.generateTransactionHash({
        tx: rawTransaction,
        accountExternalId: newExternalId,
      });

      // Update if hash changed
      if (tx.originalId !== newOriginalId) {
        await tx.update({ originalId: newOriginalId });
        migratedCount++;
      }
    }

    // Update account's externalId to the new value
    await account.update({ externalId: newExternalId });

    logger.info(`Migrated ${migratedCount} transaction hashes for account ${account.id}`);

    return migratedCount;
  }

  /**
   * Generate a unique hash for a transaction.
   * Uses entry_reference if available (unique and immutable per account per ASPSP),
   * otherwise falls back to a combination of transaction attributes.
   *
   * IMPORTANT: accountExternalId is included because entry_reference is only unique
   * per account, not globally unique across all accounts.
   *
   * Note: Dates ARE included in the fallback hash because having two genuinely
   * different transactions with identical attributes (same amount, accounts,
   * description) is more common than Enable Banking returning the same transaction
   * with progressively populated date fields without an entry_reference.
   */
  private generateTransactionHash({
    tx,
    accountExternalId,
  }: {
    tx: EnableBankingTransaction;
    accountExternalId: string;
  }): string {
    // If entry_reference is available, it's the most reliable unique identifier
    // per Enable Banking docs: "unique and immutable for accounts with the same identification hashes"
    // Include accountExternalId since entry_reference is only unique per account
    if (tx.entry_reference) {
      return crypto
        .createHash('sha256')
        .update(JSON.stringify({ account: accountExternalId, entry_ref: tx.entry_reference }))
        .digest('hex');
    }

    // Fall back to combination of transaction attributes
    // Including dates for better uniqueness - two identical transactions on different days should be distinct
    const hashData = {
      // Account identifier - ensures global uniqueness
      account_external_id: accountExternalId,
      // Required fields - always present
      amount: tx.transaction_amount.amount,
      currency: tx.transaction_amount.currency,
      credit_debit_indicator: tx.credit_debit_indicator,
      // Date field - use priority-based selection for hash stability
      // This ensures hash stays stable when lower-priority dates are added later
      date: this.getTransactionDateString(tx),
      // Account identifiers (debtor/creditor)
      debtor_account: tx.debtor_account?.iban,
      creditor_account: tx.creditor_account?.iban,
    };

    return crypto.createHash('sha256').update(JSON.stringify(hashData)).digest('hex');
  }

  /**
   * Get the transaction date as a string using priority-based selection.
   * Used for both hash generation and display date.
   *
   * Priority: transaction_date > value_date > booking_date
   *
   * In real-world banking flow, dates typically follow this chronological order:
   * transaction_date < value_date < booking_date
   * (e.g., card swipe on Jan 15 → funds move Jan 16 → bank books it Jan 17)
   *
   * By selecting in priority order (transaction_date first), we:
   * 1. Get the earliest/most accurate date of when the transaction occurred
   * 2. Ensure hash stability - if transaction_date exists, we always use it,
   *    even if booking_date is added in a subsequent sync
   */
  private getTransactionDateString(tx: EnableBankingTransaction): string | null {
    return tx.transaction_date || tx.value_date || tx.booking_date || null;
  }
}
