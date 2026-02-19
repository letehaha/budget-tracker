import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES, API_ERROR_CODES, BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { BadRequestError, NotFoundError } from '@js/errors';
import { logger } from '@js/utils';
import { type BankProvider, trackBankConnected } from '@js/utils/posthog';
import Accounts from '@models/Accounts.model';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import { getCurrency } from '@models/Currencies.model';
import { calculateRefAmount } from '@root/services/calculate-ref-amount.service';
import { withTransaction } from '@root/services/common/with-transaction';
import { addUserCurrencies } from '@services/currencies/add-user-currency';

import { bankProviderRegistry } from '../registry';
import { syncTransactionsForAccount } from './sync-transactions-for-account';

const PROVIDER_TO_ANALYTICS_TYPE: Record<BANK_PROVIDER_TYPE, BankProvider> = {
  [BANK_PROVIDER_TYPE.MONOBANK]: 'monobank',
  [BANK_PROVIDER_TYPE.ENABLE_BANKING]: 'enable_banking',
  [BANK_PROVIDER_TYPE.LUNCHFLOW]: 'lunchflow',
};

const PROVIDER_TO_ACCOUNT_TYPE: Record<BANK_PROVIDER_TYPE, ACCOUNT_TYPES> = {
  [BANK_PROVIDER_TYPE.MONOBANK]: ACCOUNT_TYPES.monobank,
  [BANK_PROVIDER_TYPE.ENABLE_BANKING]: ACCOUNT_TYPES.enableBanking,
  [BANK_PROVIDER_TYPE.LUNCHFLOW]: ACCOUNT_TYPES.lunchflow,
};

/**
 * Create accounts in the database within a transaction.
 * Returns created accounts so sync can happen after the transaction commits.
 */
const createAccountsForConnection = withTransaction(
  async ({
    connectionId,
    userId,
    accountExternalIds,
  }: {
    connectionId: number;
    userId: number;
    accountExternalIds: string[];
  }): Promise<Accounts[]> => {
    const connection = await BankDataProviderConnections.findOne({
      where: {
        id: connectionId,
        userId,
      },
    });

    if (!connection) {
      throw new NotFoundError({
        message: t({ key: 'errors.connectionNotFound' }),
        code: API_ERROR_CODES.notFound,
      });
    }

    const provider = bankProviderRegistry.get(connection.providerType as BANK_PROVIDER_TYPE);

    // Fetch all available accounts from provider
    const availableAccounts = await provider.fetchAccounts(connectionId);

    // Filter to only selected accounts
    const selectedAccounts = availableAccounts.filter((acc) => accountExternalIds.includes(acc.externalId));

    if (selectedAccounts.length === 0) {
      throw new BadRequestError({
        message: t({ key: 'bankDataProviders.noValidAccountIds' }),
      });
    }

    // Create accounts in database
    const createdAccounts: Accounts[] = [];
    for (const providerAccount of selectedAccounts) {
      // Check if account already exists
      const existingAccount = await Accounts.findOne({
        where: {
          userId,
          externalId: providerAccount.externalId,
          bankDataProviderConnectionId: connectionId,
        },
      });

      if (existingAccount) {
        // Update existing account
        await existingAccount.update({
          isEnabled: true,
        });
        createdAccounts.push(existingAccount);
      } else {
        // Ensure user has the currency for this account
        const currency = await getCurrency({ code: providerAccount.currency.toUpperCase() });
        await addUserCurrencies([{ userId, currencyCode: currency.code }]);

        const accountRefBalance = await calculateRefAmount({
          amount: Money.fromCents(providerAccount.balance),
          userId,
          date: new Date(),
          baseCode: providerAccount.currency,
        });

        // Create new account
        const accountName =
          providerAccount.name ||
          [providerAccount.metadata?.institutionName, providerAccount.currency].filter(Boolean).join(' ') ||
          providerAccount.externalId;

        const newAccount = await Accounts.create({
          userId,
          name: accountName,
          type: PROVIDER_TO_ACCOUNT_TYPE[connection.providerType as BANK_PROVIDER_TYPE],
          accountCategory: ACCOUNT_CATEGORIES.general,
          currencyCode: providerAccount.currency,
          initialBalance: providerAccount.balance,
          refInitialBalance: accountRefBalance,
          currentBalance: providerAccount.balance,
          refCurrentBalance: accountRefBalance,
          creditLimit: (providerAccount.metadata?.creditLimit as number) || 0,
          refCreditLimit: (providerAccount.metadata?.creditLimit as number) || 0,
          externalId: providerAccount.externalId,
          externalData: providerAccount.metadata || {},
          isEnabled: true,
          bankDataProviderConnectionId: connectionId,
        });
        createdAccounts.push(newAccount);
      }
    }

    // Update connection's last sync timestamp
    await connection.update({ lastSyncAt: new Date() });

    // Track analytics event
    if (createdAccounts.length > 0) {
      trackBankConnected({
        userId,
        provider: PROVIDER_TO_ANALYTICS_TYPE[connection.providerType as BANK_PROVIDER_TYPE],
        accountsCount: createdAccounts.length,
      });
    }

    return createdAccounts;
  },
);

/**
 * Connect selected external accounts and trigger initial transaction sync.
 * Account creation is transactional; sync happens after commit so failures
 * don't roll back account creation.
 */
export const connectSelectedAccounts = async ({
  connectionId,
  userId,
  accountExternalIds,
}: {
  connectionId: number;
  userId: number;
  accountExternalIds: string[];
}): Promise<Accounts[]> => {
  // Step 1: Create accounts in a transaction
  const createdAccounts = await createAccountsForConnection({
    connectionId,
    userId,
    accountExternalIds,
  });

  // Step 2: Trigger sync AFTER the transaction commits.
  // Sync errors should not affect account creation.
  for (const account of createdAccounts) {
    try {
      await syncTransactionsForAccount({
        connectionId,
        userId,
        accountId: account.id,
      });
    } catch (error) {
      logger.error({
        message: `[connectSelectedAccounts] Initial transaction sync failed for account ${account.id}, will retry on next sync`,
        error: error as Error,
      });
    }
  }

  return createdAccounts;
};
