import {
  ACCOUNT_TYPES,
  API_ERROR_CODES,
  type AccountExternalData,
  BANK_PROVIDER_TYPE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { Money } from '@common/types/money';
import { NotFoundError, ValidationError } from '@js/errors';
import AccountGrouping from '@models/accounts-groups/account-grouping.model';
import AccountGroup from '@models/accounts-groups/account-groups.model';
import Accounts, { getAccountById } from '@models/accounts.model';
import BankDataProviderConnections from '@models/bank-data-provider-connections.model';
import { namespace } from '@models/connection';
import Transactions from '@models/transactions.model';
import { restampRefInitialBalance } from '@services/accounts/restamp-ref-initial-balance';
import { bankProviderRegistry } from '@services/bank-data-providers';
import { syncTransactionsForAccount } from '@services/bank-data-providers/connection/sync-transactions-for-account';
import { withTransaction } from '@services/common/with-transaction';
import { assertNotDerivedBalanceAccount } from '@services/accounts/derived-balance-guard';
import { QueryTypes } from 'sequelize';

const PROVIDER_TO_ACCOUNT_TYPE: Record<BANK_PROVIDER_TYPE, ACCOUNT_TYPES> = {
  [BANK_PROVIDER_TYPE.MONOBANK]: ACCOUNT_TYPES.monobank,
  [BANK_PROVIDER_TYPE.ENABLE_BANKING]: ACCOUNT_TYPES.enableBanking,
  [BANK_PROVIDER_TYPE.LUNCHFLOW]: ACCOUNT_TYPES.lunchflow,
  [BANK_PROVIDER_TYPE.WALUTOMAT]: ACCOUNT_TYPES.walutomat,
  [BANK_PROVIDER_TYPE.SIMPLEFIN]: ACCOUNT_TYPES.simplefin,
};

interface LinkAccountToBankConnectionPayload {
  accountId: string;
  connectionId: string;
  externalAccountId: string;
  userId: number;
}

interface LinkResult {
  account: Accounts;
  balanceAdjustmentTransaction: null;
  balanceDifference: number;
}

/**
 * Restores `initialBalance + Σsigned(tx) = currentBalance` after the post-link
 * sync backfilled the provider's transactions and force-wrote its authoritative
 * balance. Only the opening balance moves: the bank owns `currentBalance`, and
 * the residual is by definition history the provider never handed us.
 */
const absorbLinkResidualIntoOpeningBalance = async ({
  accountId,
  userId,
}: {
  accountId: string;
  userId: number;
}): Promise<void> => {
  const sequelizeTx = namespace.get('transaction');

  const [row] = await Transactions.sequelize!.query<{ signedSum: string }>(
    `SELECT COALESCE(SUM(CASE WHEN "transactionType" = :incomeType THEN "amount" ELSE -"amount" END), 0) AS "signedSum"
     FROM "Transactions" WHERE "accountId" = :accountId`,
    {
      replacements: { accountId, incomeType: TRANSACTION_TYPES.income },
      type: QueryTypes.SELECT,
      transaction: sequelizeTx,
    },
  );

  const account = await Accounts.findOne({ where: { id: accountId, userId }, transaction: sequelizeTx });
  if (!account) return;

  const signedSumCents = Number(row?.signedSum ?? 0);
  const identityGapCents = account.currentBalance.toCents() - (account.initialBalance.toCents() + signedSumCents);
  if (identityGapCents === 0) return;

  await Accounts.update(
    { initialBalance: Money.fromCents(account.initialBalance.toCents() + identityGapCents) },
    { where: { id: accountId, userId } },
  );
  await restampRefInitialBalance({ accountId, allowProviderAccount: true });
};

/**
 * Links a system account to a bank connection using forward-only strategy.
 * This operation:
 * 1. Validates the account is a system account
 * 2. Fetches current balance from external provider
 * 3. Validates currency match between system and external accounts
 * 4. Updates account type to match provider (e.g., 'monobank')
 * 5. Stores linking metadata in account's externalData
 * 6. Syncs the provider's transactions, then absorbs whatever balance residual
 *    those transactions do not explain into the opening balance
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
    // 1. Fetch and validate the account (owner-scoped: the where-clause can't match another user's row)
    const account = await getAccountById({ id: accountId, userId });

    if (!account) {
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

    assertNotDerivedBalanceAccount({ account, actionPhrase: 'be linked to a bank connection' });

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

    // 7. Update account metadata with linking information
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
          adjustmentTransactionId: null,
        },
      },
    };

    // 8. Update account to external type
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

    // 9. Update connection's last sync timestamp
    await bankConnection.update({ lastSyncAt: new Date() });

    // 10. Add account to the connection's AccountGroup if it exists and account is ungrouped
    const connectionGroup = await AccountGroup.findOne({
      where: { bankDataProviderConnectionId: connectionId, userId },
    });

    if (connectionGroup) {
      const existingGrouping = await AccountGrouping.findOne({
        where: { accountId },
      });

      if (!existingGrouping) {
        await AccountGrouping.create({ accountId, groupId: connectionGroup.id });
      }
    }

    // 11. Trigger automatic transaction sync for the newly linked account
    // This uses the syncTransactionsForAccount service which handles all the logic
    // including checking correct from-to dates, rate limits, and provider-specific behavior
    await syncTransactionsForAccount({
      connectionId,
      userId,
      accountId,
    });

    // 12. Re-anchor the opening balance against what the sync actually wrote.
    // Providers that enqueue their sync (Monobank) have changed nothing yet, so
    // the gap is zero and this is a no-op for them.
    await absorbLinkResidualIntoOpeningBalance({ accountId, userId });

    // 13. Fetch and return the updated account
    const updatedAccount = await Accounts.findByPk(accountId);

    return {
      account: updatedAccount!,
      balanceAdjustmentTransaction: null,
      balanceDifference,
    };
  },
);
