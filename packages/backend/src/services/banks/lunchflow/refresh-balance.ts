import { ACCOUNT_TYPES, API_ERROR_CODES } from '@bt/shared/types';
import { NotFoundError, UnexpectedError } from '@js/errors';
import Balances from '@models/Balances.model';
import * as accountsService from '@services/accounts.service';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import * as userSettingsService from '@services/user-settings.service';

import { LunchFlowApiClient } from './api-client';

interface RefreshBalanceParams {
  userId: number;
  accountId: number;
}

/**
 * Fetches the current balance from Lunchflow API and updates both:
 * 1. Account's currentBalance field
 * 2. Balance history in Balances table (for trend tracking)
 *
 * This is the primary way to keep Lunchflow account balances up to date.
 * Should be called periodically (e.g., via cron every 12 hours) or manually by users.
 */
export const refreshBalance = async ({ userId, accountId }: RefreshBalanceParams) => {
  const account = await accountsService.getAccountById({
    id: accountId,
    userId,
  });

  if (!account || account.type !== ACCOUNT_TYPES.lunchflow) {
    throw new NotFoundError({
      message: 'Lunch Flow account not found',
      code: API_ERROR_CODES.notFound,
    });
  }

  const encryptedToken = await userSettingsService.getEncryptedLunchFlowApiToken(userId);
  if (!encryptedToken) {
    throw new NotFoundError({
      message: 'No Lunch Flow API key found',
      code: API_ERROR_CODES.notFound,
    });
  }

  try {
    const client = new LunchFlowApiClient(encryptedToken);
    const { balance } = await client.getBalance(Number(account.externalId));

    const balanceInCents = Math.round(balance.amount * 100);

    // Calculate balance in user's base currency for Balances table
    const refBalanceInCents = await calculateRefAmount({
      amount: balanceInCents,
      userId,
      baseCode: balance.currency, // Account's currency (e.g., PLN)
      date: new Date(),
    });

    // Update account's current balance
    // Both currentBalance (account currency) and refCurrentBalance (base currency)
    await accountsService.updateAccount({
      id: account.id,
      userId,
      currentBalance: balanceInCents,
      refCurrentBalance: refBalanceInCents,
    });

    // Create/update balance snapshot in Balances table for history tracking
    // Balances table stores amounts in base currency
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingBalance = await Balances.findOne({
      where: {
        accountId: account.id,
        date: today,
      },
    });

    if (existingBalance) {
      // Update existing balance for today
      existingBalance.amount = refBalanceInCents;
      await existingBalance.save();
    } else {
      // Create new balance snapshot
      await Balances.create({
        accountId: account.id,
        date: today,
        amount: refBalanceInCents,
      });
    }

    return {
      message: 'Balance refreshed successfully',
      balance: balance.amount,
      currency: balance.currency,
    };
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new UnexpectedError(API_ERROR_CODES.unexpected, 'Failed to refresh balance from Lunch Flow');
  }
};
