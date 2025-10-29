import {
  ACCOUNT_TYPES,
  API_ERROR_CODES,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { NotFoundError, UnexpectedError } from '@js/errors';
import * as Users from '@models/Users.model';
import * as accountsService from '@services/accounts.service';
import * as transactionsService from '@services/transactions';
import * as userSettingsService from '@services/user-settings.service';

import { LunchFlowApiClient } from './api-client';

interface SyncTransactionsParams {
  userId: number;
  accountId: number;
}

export const syncTransactions = async ({ userId, accountId }: SyncTransactionsParams) => {
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
    const { transactions: lfTransactions } = await client.getTransactions(Number(account.externalId));

    // Get user's default category to auto-assign to transactions
    const defaultCategoryId = (await Users.getUserDefaultCategory({ id: userId }))!.get('defaultCategoryId');

    let newCount = 0;
    for (const tx of lfTransactions) {
      // Check if transaction already exists
      const exists = await transactionsService.getTransactionBySomeId({
        userId,
        originalId: tx.id,
      });

      if (!exists) {
        await transactionsService.createTransaction({
          userId,
          accountId: account.id,
          accountType: ACCOUNT_TYPES.lunchflow, // Lunchflow transactions don't update balances
          amount: Math.abs(Math.round(tx.amount * 100)), // Convert to cents
          transactionType: tx.amount > 0 ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense,
          paymentType: PAYMENT_TYPES.bankTransfer,
          time: new Date(tx.date),
          note: tx.description || tx.merchant || 'Transaction',
          categoryId: defaultCategoryId, // Auto-assign user's default category
          transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
          originalId: tx.id,
          externalData: {},
        });
        newCount++;
      }
    }

    return {
      message: `Synced ${newCount} new transaction(s)`,
      total: lfTransactions.length,
      new: newCount,
    };
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new UnexpectedError(API_ERROR_CODES.unexpected, 'Failed to sync transactions from Lunch Flow');
  }
};
