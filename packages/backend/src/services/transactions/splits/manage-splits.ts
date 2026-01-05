import TransactionSplits, {
  CreateSplitPayload,
  bulkCreateSplits,
  deleteSplitsForTransaction,
} from '@models/TransactionSplits.model';
import Transactions from '@models/Transactions.model';
import * as UsersCurrencies from '@models/UsersCurrencies.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';

import { SplitInput } from './types';
import { assertValidSplits } from './validate-splits';

interface ManageSplitsParams {
  transactionId: number;
  userId: number;
  splits: SplitInput[];
  transactionAmount: number;
  transactionCurrencyCode: string;
  transactionTime: Date;
  transferNature?: string;
}

/**
 * Creates or updates splits for a transaction.
 * Validates splits, deletes existing ones, and creates new ones.
 */
export const manageSplits = async ({
  transactionId,
  userId,
  splits,
  transactionAmount,
  transactionCurrencyCode,
  transactionTime,
  transferNature,
}: ManageSplitsParams): Promise<TransactionSplits[]> => {
  // If no splits provided, just delete existing ones
  if (!splits || splits.length === 0) {
    await deleteSplitsForTransaction({ transactionId, userId });
    return [];
  }

  // Validate splits
  await assertValidSplits({
    splits,
    transactionAmount,
    userId,
    transferNature: transferNature as Parameters<typeof assertValidSplits>[0]['transferNature'],
  });

  // Get user's base currency for refAmount calculation
  const { currency: baseCurrency } = await UsersCurrencies.getCurrency({
    userId,
    isDefaultCurrency: true,
  });

  const isBaseCurrency = transactionCurrencyCode === baseCurrency.code;

  // Prepare split payloads with calculated refAmounts
  const splitPayloads: CreateSplitPayload[] = await Promise.all(
    splits.map(async (split) => {
      let refAmount = split.amount;

      // Calculate refAmount if transaction is in a different currency
      if (!isBaseCurrency) {
        if (split.refAmount !== undefined) {
          // Use provided refAmount if available
          refAmount = split.refAmount;
        } else {
          // Calculate refAmount based on exchange rate
          refAmount = await calculateRefAmount({
            userId,
            amount: split.amount,
            baseCode: transactionCurrencyCode,
            quoteCode: baseCurrency.code,
            date: transactionTime,
          });
        }
      }

      return {
        transactionId,
        userId,
        categoryId: split.categoryId,
        amount: split.amount,
        refAmount,
        note: split.note || null,
      };
    }),
  );

  // Delete existing splits and create new ones (atomic replacement)
  await deleteSplitsForTransaction({ transactionId, userId });
  const createdSplits = await bulkCreateSplits({ data: splitPayloads });

  return createdSplits;
};

/**
 * Get splits for a transaction and calculate the primary category amount.
 */
export const getSplitsWithPrimaryAmount = async ({
  transaction,
}: {
  transaction: Transactions;
}): Promise<{
  splits: TransactionSplits[];
  primaryAmount: number;
  primaryRefAmount: number;
}> => {
  const splits = await TransactionSplits.findAll({
    where: {
      transactionId: transaction.id,
      userId: transaction.userId,
    },
  });

  const splitsTotal = splits.reduce((sum, split) => sum + Number(split.amount), 0);
  const splitsRefTotal = splits.reduce((sum, split) => sum + Number(split.refAmount), 0);

  return {
    splits,
    primaryAmount: transaction.amount - splitsTotal,
    primaryRefAmount: transaction.refAmount - splitsRefTotal,
  };
};
