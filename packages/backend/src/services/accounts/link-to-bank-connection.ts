import {
  ACCOUNT_TYPES,
  API_ERROR_CODES,
  type AccountExternalData,
  BANK_PROVIDER_TYPE,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { Money } from '@common/types/money';
import { NotFoundError, ValidationError } from '@js/errors';
import Accounts from '@models/Accounts.model';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import Transactions from '@models/Transactions.model';
import { bankProviderRegistry } from '@services/bank-data-providers';
import { syncTransactionsForAccount } from '@services/bank-data-providers/connection/sync-transactions-for-account';
import { withTransaction } from '@services/common/with-transaction';
import { createTransaction } from '@services/transactions/create-transaction';

const PROVIDER_TO_ACCOUNT_TYPE: Record<BANK_PROVIDER_TYPE, ACCOUNT_TYPES> = {
  [BANK_PROVIDER_TYPE.MONOBANK]: ACCOUNT_TYPES.monobank,
  [BANK_PROVIDER_TYPE.ENABLE_BANKING]: ACCOUNT_TYPES.enableBanking,
  [BANK_PROVIDER_TYPE.LUNCHFLOW]: ACCOUNT_TYPES.lunchflow,
  [BANK_PROVIDER_TYPE.WALUTOMAT]: ACCOUNT_TYPES.walutomat,
};

interface LinkAccountToBankConnectionPayload {
  accountId: number;
  connectionId: number;
  externalAccountId: string;
  userId: number;
}

interface LinkResult {
  account: Accounts;
  balanceAdjustmentTransaction?: Transactions | null;
  balanceDifference: number;
}

/**
 * Links a system account to a bank connection using forward-only strategy.
 * This operation:
 * 1. Validates the account is a system account
 * 2. Fetches current balance from external provider
 * 3. Validates currency match between system and external accounts
 * 4. Creates balance adjustment transaction if there's a difference
 * 5. Updates account type to match provider (e.g., 'monobank')
 * 6. Stores linking metadata in account's externalData
 *
 * Note: Existing transactions remain as 'system' type to preserve data integrity.
 * Only newly synced transactions will have the external account type.
 */
export const linkAccountToBankConnection = withTransaction(
  async ({
    accountId,
    connectionId,
    externalAccountId,
    userId,
  }: LinkAccountToBankConnectionPayload): Promise<LinkResult> => {
    // 1. Fetch and validate the account
    const account = await Accounts.findByPk(accountId);

    if (!account || account.userId !== userId) {
      throw new NotFoundError({
        message: `Account with id "${accountId}" not found.`,
        code: API_ERROR_CODES.notFound,
      });
    }

    // Verify account is a system account
    if (account.type !== ACCOUNT_TYPES.system) {
      throw new ValidationError({
        message: 'Only system accounts can be linked to a bank connection.',
      });
    }

    // 2. Fetch and validate the bank connection
    const bankConnection = await BankDataProviderConnections.findOne({
      where: {
        id: connectionId,
        userId,
      },
    });

    if (!bankConnection) {
      throw new NotFoundError({
        message: `Bank connection with id "${connectionId}" not found.`,
        code: API_ERROR_CODES.notFound,
      });
    }

    if (!bankConnection.isActive) {
      throw new ValidationError({
        message: 'Cannot link to an inactive bank connection.',
      });
    }

    // 3. Get provider and fetch external account details
    const provider = bankProviderRegistry.get(bankConnection.providerType as BANK_PROVIDER_TYPE);
    const externalAccounts = await provider.fetchAccounts(connectionId);

    const externalAccount = externalAccounts.find((acc) => acc.externalId === externalAccountId);

    if (!externalAccount) {
      throw new NotFoundError({
        message: `External account with id "${externalAccountId}" not found in this connection.`,
        code: API_ERROR_CODES.notFound,
      });
    }

    // 4. Verify currency match
    if (externalAccount.currency.toLowerCase() !== account.currencyCode.toLowerCase()) {
      throw new ValidationError({
        message: `Currency mismatch: System account uses ${account.currencyCode}, but external account uses ${externalAccount.currency}. Only accounts with matching currencies can be linked.`,
      });
    }

    // 5. Calculate balance difference
    const systemBalance = account.currentBalance.toCents();
    const externalBalance = externalAccount.balance;
    const balanceDifference = externalBalance - systemBalance;

    // 6. Store current state in account metadata before linking
    const existingExternalData = account.externalData || {};
    const linkedAt = new Date().toISOString();

    // 7. Create balance adjustment transaction if needed
    let balanceAdjustmentTransaction: Transactions | null = null;

    if (Math.abs(balanceDifference) > 0.01) {
      // Create transfer_out_wallet transaction to reconcile the difference
      // Note: The transaction hook will automatically update the account balance
      const [createdTransaction] = await createTransaction({
        userId,
        accountId: account.id,
        amount: Money.fromCents(Math.abs(balanceDifference)),
        time: new Date(),
        transactionType: balanceDifference > 0 ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense,
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
        // At this point of time transactions should still be "system" because its
        // behaviour is system-like one
        accountType: ACCOUNT_TYPES.system,
        paymentType: PAYMENT_TYPES.bankTransfer, // Balance adjustment from bank connection
        note: `Balance adjustment when linking to bank connection. System: ${systemBalance}, External: ${externalBalance}`,
        externalData: {
          type: 'bank_connection_balance_adjustment',
          connectionId,
          linkedAt,
          balances: {
            system: systemBalance,
            external: externalBalance,
            difference: balanceDifference,
          },
        },
      });

      balanceAdjustmentTransaction = createdTransaction;
    }

    // 8. Update account metadata with linking information
    // Include external account metadata (iban, product, ownerName, etc.) to ensure
    // IBAN is stored for account matching during reconnection flows
    const updatedExternalData: AccountExternalData = {
      ...existingExternalData,
      ...externalAccount.metadata,
      bankConnection: {
        linkedAt,
        linkingStrategy: 'forward-only' as const,
        balanceReconciliation: {
          systemBalance,
          externalBalance,
          difference: balanceDifference,
          adjustmentTransactionId: balanceAdjustmentTransaction?.id || null,
        },
      },
    };

    // 9. Update account to external type
    const newAccountType = PROVIDER_TO_ACCOUNT_TYPE[bankConnection.providerType as BANK_PROVIDER_TYPE];

    await account.update({
      type: newAccountType,
      externalId: externalAccountId,
      externalData: updatedExternalData,
      bankDataProviderConnectionId: connectionId,
    });

    // Note: We intentionally do NOT convert existing system transactions to the new account type.
    // Existing transactions remain as 'system' type (or whatever they are at this point of time)
    // to maintain data integrity and audit trail.
    // Only new transactions synced from the provider will have the external account type.

    // 10. Update connection's last sync timestamp
    await bankConnection.update({ lastSyncAt: new Date() });

    // 11. Trigger automatic transaction sync for the newly linked account
    // This uses the syncTransactionsForAccount service which handles all the logic
    // including checking correct from-to dates, rate limits, and provider-specific behavior
    await syncTransactionsForAccount({
      connectionId,
      userId,
      accountId,
    });

    // 12. Fetch and return the updated account
    const updatedAccount = await Accounts.findByPk(accountId);

    return {
      account: updatedAccount!,
      balanceAdjustmentTransaction,
      balanceDifference,
    };
  },
);
