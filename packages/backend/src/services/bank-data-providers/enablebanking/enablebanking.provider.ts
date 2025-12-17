/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ACCOUNT_TYPES,
  BANK_PROVIDER_TYPE,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { BadRequestError, ForbiddenError, NotFoundError, ValidationError } from '@js/errors';
import { toSystemAmount } from '@js/helpers/system-amount';
import Accounts from '@models/Accounts.model';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import Transactions from '@models/Transactions.model';
import { getUserDefaultCategory } from '@models/Users.model';
import {
  BaseBankDataProvider,
  CredentialFieldType,
  DateRange,
  ProviderAccount,
  ProviderBalance,
  ProviderMetadata,
  ProviderTransaction,
} from '@services/bank-data-providers';
import { createTransaction } from '@services/transactions';
import crypto from 'crypto';

import { SyncStatus, setAccountSyncStatus } from '../sync/sync-status-tracker';
import { encryptCredentials } from '../utils/credential-encryption';
import { EnableBankingApiClient } from './api-client';
import { generateState, validatePrivateKey, validateState } from './jwt-utils';
import {
  CreditDebitIndicator,
  EnableBankingAccount,
  EnableBankingConnectionParams,
  EnableBankingCredentials,
  EnableBankingMetadata,
  OAuthCallbackParams,
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
    credentialFields: [
      {
        name: 'appId',
        type: CredentialFieldType.TEXT,
        label: 'Application ID',
        placeholder: 'Enter your Enable Banking app_id',
        required: true,
        helpText: 'Get your app_id from Enable Banking portal after uploading your certificate',
      },
      {
        name: 'privateKey',
        type: CredentialFieldType.PASSWORD,
        label: 'Private Key',
        placeholder: 'Paste your PEM-encoded RSA private key',
        required: true,
        helpText: 'Your RSA private key used to sign JWT tokens (stored encrypted)',
      },
      {
        name: 'bankName',
        type: CredentialFieldType.TEXT,
        label: 'Bank Name',
        placeholder: 'e.g., Nordea',
        required: true,
        helpText: 'Name of the bank you want to connect (must match ASPSP name exactly)',
      },
      {
        name: 'bankCountry',
        type: CredentialFieldType.TEXT,
        label: 'Bank Country',
        placeholder: 'e.g., FI',
        required: true,
        helpText: 'Two-letter country code (ISO 3166-1 alpha-2)',
      },
    ],
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
      throw new ValidationError({ message: 'Invalid credentials format for Enable Banking' });
    }

    const { appId, privateKey, bankName, bankCountry, redirectUrl, maxConsentValidity } = credentials;

    // Validate private key format
    if (!validatePrivateKey(privateKey)) {
      throw new ValidationError({ message: 'Invalid RSA private key format' });
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
      throw new ForbiddenError({ message: 'Invalid Enable Banking credentials' });
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
      throw new BadRequestError({ message: 'Authorization URL not found for this connection' });
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
      throw new ValidationError({ message: 'Invalid OAuth state parameter' });
    }

    if (!validateState(callbackParams.state, connection.userId)) {
      throw new ValidationError({ message: 'OAuth state expired or invalid' });
    }

    // Check for OAuth errors
    if (callbackParams.error) {
      throw new BadRequestError({
        message: `OAuth authorization failed: ${callbackParams.error_description || callbackParams.error}`,
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

    // Update metadata with account UIDs and consent dates
    const updatedMetadata: EnableBankingMetadata = {
      ...metadata,
      accounts: sessionResponse.accounts.map((account) => account.uid),
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
   * Update externalId for existing accounts after reconnection.
   * Enable Banking assigns new UUIDs after each authorization, but IBAN stays the same.
   * This method matches accounts by IBAN and updates their externalId to the new value.
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

    // Match and update existing accounts by IBAN + currency
    for (const existingAccount of existingAccounts) {
      const existingIban = (existingAccount.externalData as Record<string, unknown>)?.iban;
      if (!existingIban) continue;

      const matchingNewAccount = newAccounts.find(
        (newAcc) => newAcc.account_id?.iban === existingIban && newAcc.currency === existingAccount.currencyCode,
      );

      if (matchingNewAccount && matchingNewAccount.uid !== existingAccount.externalId) {
        await existingAccount.update({
          externalId: matchingNewAccount.uid,
        });
      }
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
      throw new BadRequestError({ message: 'Bank information not found in connection metadata' });
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
      throw new ValidationError({ message: 'Invalid credentials format for Enable Banking' });
    }

    const connection = await this.getConnection(connectionId);
    this.validateProviderType(connection);

    // Validate new credentials
    const isValid = await this.validateCredentials(newCredentials);
    if (!isValid) {
      throw new ForbiddenError({ message: 'Invalid Enable Banking credentials' });
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
      throw new BadRequestError({ message: 'No active session. Please complete OAuth flow first.' });
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
        const balanceSystemAmount = toSystemAmount(balanceFloat);

        return {
          externalId: details.uid,
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
          },
        };
      }),
    );

    return accountsData;
  }

  async syncAccounts(connectionId: number): Promise<void> {
    const connection = await this.getConnection(connectionId);
    this.validateProviderType(connection);

    const providerAccounts = await this.fetchAccounts(connectionId);

    // Get existing accounts
    const existingAccounts = await Accounts.findAll({
      where: {
        userId: connection.userId,
        bankDataProviderConnectionId: connectionId,
      },
    });

    // Sync each account
    for (const providerAccount of providerAccounts) {
      // Match by IBAN (stable across reconnections) first, then fallback to externalId
      const existingAccount = existingAccounts.find((acc) => {
        const existingIban = (acc.externalData as Record<string, unknown>)?.iban;
        const providerIban = providerAccount.metadata?.iban;

        // Primary: match by IBAN + currency (stable across reconnections)
        if (existingIban && providerIban && existingIban === providerIban) {
          return acc.currencyCode === providerAccount.currency;
        }

        // Fallback: match by externalId (for backwards compatibility)
        return acc.externalId === providerAccount.externalId;
      });

      if (existingAccount) {
        // Update existing account, including the new externalId from provider
        // This is critical for reconnection flows where Enable Banking assigns new UUIDs
        await existingAccount.update({
          name: providerAccount.name,
          currentBalance: providerAccount.balance,
          externalId: providerAccount.externalId,
          externalData: providerAccount.metadata || existingAccount.externalData,
        });
      } else {
        // Create new account
        await Accounts.create({
          userId: connection.userId,
          name: providerAccount.name,
          type: ACCOUNT_TYPES.enableBanking,
          accountCategory: 'general',
          currencyCode: providerAccount.currency,
          initialBalance: providerAccount.balance,
          refInitialBalance: providerAccount.balance,
          currentBalance: providerAccount.balance,
          refCurrentBalance: providerAccount.balance,
          creditLimit: 0,
          refCreditLimit: 0,
          externalId: providerAccount.externalId,
          externalData: providerAccount.metadata || {},
          isEnabled: true,
          bankDataProviderConnectionId: connectionId,
        } as any);
      }
    }

    await this.updateLastSync(connectionId);
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

    if (!credentials.sessionId) {
      throw new BadRequestError({ message: 'No active session' });
    }

    const apiClient = new EnableBankingApiClient(credentials);

    // Get all transactions for the date range
    const transactions = await apiClient.getAllTransactions(accountExternalId, {
      date_from: dateRange?.from?.toISOString().split('T')[0],
      date_to: dateRange?.to?.toISOString().split('T')[0],
    });

    return transactions.map((tx) => {
      const isExpense = tx.credit_debit_indicator === CreditDebitIndicator.DBIT;
      const amountFloat = parseFloat(tx.transaction_amount.amount);
      const amountSystemAmount = toSystemAmount(amountFloat);
      const merchantName = tx.debtor?.name || tx.creditor?.name || 'Unknown';

      // Generate unique hash from transaction data (excluding transaction_id which may be null)
      // This ensures consistent IDs even if transaction_id changes from null to a value later
      const hashData = {
        booking_date: tx.booking_date,
        amount: tx.transaction_amount.amount,
        currency: tx.transaction_amount.currency,
        entry_reference: tx.entry_reference,
        debtor_account: tx.debtor_account?.iban,
        creditor_account: tx.creditor_account?.iban,
        remittance_information: tx.remittance_information?.join(''),
      };
      const uniqueId = crypto.createHash('sha256').update(JSON.stringify(hashData)).digest('hex');

      return {
        externalId: uniqueId,
        amount: amountSystemAmount,
        currency: tx.transaction_amount.currency,
        date: new Date(tx.booking_date),
        description: tx.remittance_information?.join(' ') || 'Transaction',
        merchantName,
        metadata: {
          // Parsed/extracted fields for easy access
          valueDate: tx.value_date,
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
  }: {
    connectionId: number;
    systemAccountId: number;
  }): Promise<void> {
    // Import sync status tracker dynamically to avoid circular dependency
    // Set status to SYNCING
    await setAccountSyncStatus(systemAccountId, SyncStatus.SYNCING);

    try {
      const account = await this.getSystemAccount(systemAccountId);
      const connection = await this.getConnection(connectionId);
      this.validateProviderType(connection);

      if (!account.externalId) {
        throw new BadRequestError({ message: 'Account does not have external ID from Enable Banking' });
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

      // Fetch transactions
      const providerTransactions = await this.fetchTransactions(connectionId, account.externalId, { from, to });

      // Process each transaction
      for (const tx of providerTransactions) {
        // Check if transaction already exists
        const existingTx = await Transactions.findOne({
          where: {
            accountId: account.id,
            originalId: tx.externalId,
          },
        });

        if (existingTx) {
          continue; // Skip existing transactions
        }

        // Determine transaction type from metadata
        const isExpense = tx.metadata?.isExpense === true;

        const { defaultCategoryId } = (await getUserDefaultCategory({ id: connection.userId }))!;

        // Create transaction using service (handles all required fields)
        await createTransaction({
          originalId: tx.externalId,
          note: tx.description,
          amount: Math.abs(tx.amount), // Ensure positive value
          time: tx.date,
          externalData: tx.metadata,
          commissionRate: 0,
          cashbackAmount: 0,
          accountId: account.id,
          userId: connection.userId,
          transactionType: isExpense ? TRANSACTION_TYPES.expense : TRANSACTION_TYPES.income,
          paymentType: PAYMENT_TYPES.bankTransfer,
          categoryId: defaultCategoryId,
          transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
          accountType: ACCOUNT_TYPES.enableBanking,
        });
      }

      // Update account balance from latest transaction if available
      if (providerTransactions.length > 0) {
        const balance = await this.fetchBalance(connectionId, account.externalId);
        await account.update({
          currentBalance: balance.amount,
        });
      }

      await this.updateLastSync(connectionId);

      // Set status to COMPLETED on success
      await setAccountSyncStatus(systemAccountId, SyncStatus.COMPLETED);
    } catch (error) {
      console.error('Enable Banking sync error:', error);
      // Set status to FAILED on error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await setAccountSyncStatus(systemAccountId, SyncStatus.FAILED, errorMessage);
      throw error; // Re-throw to maintain existing error handling
    }
  }

  // ============================================================================
  // Balance Operations
  // ============================================================================

  async fetchBalance(connectionId: number, accountExternalId: string): Promise<ProviderBalance> {
    const credentials = await this.getValidatedCredentials(connectionId);

    if (!credentials.sessionId) {
      throw new BadRequestError({ message: 'No active session' });
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
      throw new NotFoundError({ message: 'No balance information available' });
    }

    const balanceFloat = parseFloat(balance.balance_amount.amount);
    const balanceSystemAmount = toSystemAmount(balanceFloat);

    return {
      amount: balanceSystemAmount,
      currency: balance.balance_amount.currency,
      asOf: balance.reference_date ? new Date(balance.reference_date) : new Date(),
    };
  }

  async refreshBalance(connectionId: number, systemAccountId: number): Promise<void> {
    const account = await this.getSystemAccount(systemAccountId);

    if (!account.externalId) {
      throw new BadRequestError({ message: 'Account does not have external ID' });
    }

    const balance = await this.fetchBalance(connectionId, account.externalId);

    await account.update({
      currentBalance: balance.amount,
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
      psu_type: 'personal',
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
      throw new ValidationError({ message: 'Invalid stored credentials' });
    }

    return credentials;
  }
}
