import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES, API_ERROR_CODES, AccountModel } from '@bt/shared/types';
import { NotFoundError, UnexpectedError } from '@js/errors';
import { logger } from '@js/utils';
import * as accountsService from '@services/accounts.service';
import * as userSettingsService from '@services/user-settings.service';

import { LunchFlowApiClient } from './api-client';

interface SyncAccountsParams {
  userId: number;
}

export const syncAccounts = async ({ userId }: SyncAccountsParams) => {
  const encryptedToken = await userSettingsService.getEncryptedLunchFlowApiToken(userId);

  if (!encryptedToken) {
    throw new NotFoundError({
      message: 'No Lunch Flow API key found',
      code: API_ERROR_CODES.notFound,
    });
  }

  try {
    const client = new LunchFlowApiClient(encryptedToken);
    const { accounts: lunchflowAccounts } = await client.getAccounts();

    // Get existing accounts
    const existingAccounts = await accountsService.getAccounts({
      userId,
      type: ACCOUNT_TYPES.lunchflow,
    });

    const existingExternalIds = new Set(existingAccounts.map((acc) => acc.externalId));

    // Create new accounts
    const newAccounts: AccountModel[] = [];

    for (const lfAccount of lunchflowAccounts) {
      if (!existingExternalIds.has(String(lfAccount.id))) {
        // Fetch current balance and use it as initial balance
        const { balance } = await client.getBalance(lfAccount.id);
        const currentBalanceCents = Math.round(balance.amount * 100);

        logger.info('Creating account with balance:', {
          accountName: `${lfAccount.institution_name} - ${lfAccount.name}`,
          currentBalance: currentBalanceCents,
          currency: balance.currency,
        });

        // Create account with current balance as initial balance
        const account = await accountsService.createAccount({
          userId,
          name: `${lfAccount.institution_name} - ${lfAccount.name}`,
          currencyCode: balance.currency,
          accountCategory: ACCOUNT_CATEGORIES.currentAccount,
          type: ACCOUNT_TYPES.lunchflow,
          initialBalance: currentBalanceCents,
          creditLimit: 0,
          externalId: String(lfAccount.id),
          externalData: {
            institutionName: lfAccount.institution_name,
            institutionLogo: lfAccount.institution_logo,
            status: lfAccount.status,
          },
        });

        if (!account) {
          throw new UnexpectedError({
            message: `Was not able to sync account ${lfAccount.institution_name} - ${lfAccount.name}`,
          });
        }

        newAccounts.push(account);
      }
    }

    const updatedAccounts = await accountsService.getAccounts({
      userId,
      type: ACCOUNT_TYPES.lunchflow,
    });

    return {
      message: `Synced ${newAccounts.length} new account(s)`,
      newCount: newAccounts.length,
      totalCount: updatedAccounts.length,
      accounts: updatedAccounts,
    };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof UnexpectedError) {
      throw error;
    }
    throw new UnexpectedError({ message: 'Failed to sync accounts from Lunch Flow' });
  }
};
