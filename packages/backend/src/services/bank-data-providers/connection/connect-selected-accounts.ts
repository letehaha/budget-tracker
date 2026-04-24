import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  API_ERROR_CODES,
  BANK_PROVIDER_TYPE,
} from '@bt/shared/types';
import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { BadRequestError, NotFoundError } from '@js/errors';
import { logger } from '@js/utils';
import { type BankProvider, trackBankConnected } from '@js/utils/posthog';
import AccountGrouping from '@models/accounts-groups/account-grouping.model';
import AccountGroup from '@models/accounts-groups/account-groups.model';
import Accounts from '@models/accounts.model';
import BankDataProviderConnections from '@models/bank-data-provider-connections.model';
import { getCurrency } from '@models/currencies.model';
import { calculateRefAmount } from '@root/services/calculate-ref-amount.service';
import { withTransaction } from '@root/services/common/with-transaction';
import { addUserCurrencies } from '@services/currencies/add-user-currency';

import { bankProviderRegistry } from '../registry';
import { syncTransactionsForAccount } from './sync-transactions-for-account';

const PROVIDER_TO_ANALYTICS_TYPE: Record<BANK_PROVIDER_TYPE, BankProvider> = {
  [BANK_PROVIDER_TYPE.MONOBANK]: 'monobank',
  [BANK_PROVIDER_TYPE.ENABLE_BANKING]: 'enable_banking',
  [BANK_PROVIDER_TYPE.LUNCHFLOW]: 'lunchflow',
  [BANK_PROVIDER_TYPE.WALUTOMAT]: 'walutomat',
};

const PROVIDER_TO_ACCOUNT_TYPE: Record<BANK_PROVIDER_TYPE, ACCOUNT_TYPES> = {
  [BANK_PROVIDER_TYPE.MONOBANK]: ACCOUNT_TYPES.monobank,
  [BANK_PROVIDER_TYPE.ENABLE_BANKING]: ACCOUNT_TYPES.enableBanking,
  [BANK_PROVIDER_TYPE.LUNCHFLOW]: ACCOUNT_TYPES.lunchflow,
  [BANK_PROVIDER_TYPE.WALUTOMAT]: ACCOUNT_TYPES.walutomat,
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
      // Check if account already exists (still linked to this connection)
      let existingAccount = await Accounts.findOne({
        where: {
          userId,
          externalId: providerAccount.externalId,
          bankDataProviderConnectionId: connectionId,
        },
      });

      // If not found, check for a previously-linked account (disconnected
      // accounts have their connection history stored in externalData after
      // unlinking). Match by providerType + externalId — NOT by the stored
      // connectionId, which is the OLD disconnected connection's id and will
      // never equal the new one after a fresh connect.
      if (!existingAccount) {
        existingAccount = await Accounts.findOne({
          where: {
            userId,
            bankDataProviderConnectionId: null,
            externalData: {
              connectionHistory: {
                previousConnection: {
                  externalId: providerAccount.externalId,
                  providerType: connection.providerType,
                },
              },
            },
          },
        });
      }

      if (existingAccount) {
        // Re-link and re-activate the account
        await existingAccount.update({
          status: ACCOUNT_STATUSES.active,
          type: PROVIDER_TO_ACCOUNT_TYPE[connection.providerType as BANK_PROVIDER_TYPE],
          bankDataProviderConnectionId: connectionId,
          externalId: providerAccount.externalId,
        });
        createdAccounts.push(existingAccount);
      } else {
        // Ensure user has the currency for this account
        const currency = await getCurrency({ code: providerAccount.currency.toUpperCase() });
        if (!currency) {
          throw new BadRequestError({
            message: t({
              key: 'bankDataProviders.accountCurrencyNotSupported',
              variables: { currency: providerAccount.currency },
            }),
          });
        }
        await addUserCurrencies([{ userId, currencyCode: currency.code }]);

        const now = new Date();
        const accountRefBalance = await calculateRefAmount({
          amount: Money.fromCents(providerAccount.balance),
          userId,
          date: now,
          baseCode: providerAccount.currency,
        });

        const creditLimitCents = (providerAccount.metadata?.creditLimit as number) || 0;
        const refCreditLimit =
          creditLimitCents > 0
            ? await calculateRefAmount({
                amount: Money.fromCents(creditLimitCents),
                userId,
                date: now,
                baseCode: providerAccount.currency,
              })
            : Money.zero();

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
          creditLimit: creditLimitCents,
          refCreditLimit,
          externalId: providerAccount.externalId,
          externalData: providerAccount.metadata || {},
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

    // Auto-create or find the AccountGroup for this bank connection,
    // then link ungrouped accounts to it
    if (createdAccounts.length > 0) {
      const [connectionGroup] = await AccountGroup.findOrCreate({
        where: { bankDataProviderConnectionId: connectionId, userId },
        defaults: { name: connection.providerName, userId, bankDataProviderConnectionId: connectionId },
      });

      for (const account of createdAccounts) {
        // Only add if the account is not already in any group
        const existingGrouping = await AccountGrouping.findOne({
          where: { accountId: account.id },
        });

        if (!existingGrouping) {
          await AccountGrouping.create({ accountId: account.id, groupId: connectionGroup.id });
        }
      }
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
