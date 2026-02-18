import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import RefundTransactions from '@models/RefundTransactions.model';
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
  transactionAmount: Money;
  transactionCurrencyCode: string;
  transactionTime: Date;
  transferNature?: string;
}

/**
 * Creates or updates splits for a transaction.
 * Validates splits, deletes existing ones, and creates new ones.
 * Also handles refund link migration when splits are recreated.
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
  // Fetch existing splits
  const existingSplits = await TransactionSplits.findAll({
    where: { transactionId, userId },
  });

  // Build a map of categoryId -> refund info for existing splits
  const refundsByCategoryId = new Map<
    number,
    {
      totalRefundedRefAmount: Money;
      splitId: string;
      refundAmounts: { amount: Money; currencyCode: string }[];
    }
  >();

  // Query refunds for each split that exists
  for (const existingSplit of existingSplits) {
    const refunds = await RefundTransactions.findAll({
      where: { splitId: existingSplit.id, userId },
      include: [{ model: Transactions, as: 'refundTransaction' }],
    });

    if (refunds.length > 0) {
      const totalRefunded = Money.sum(refunds.map((r) => r.refundTransaction.refAmount.abs()));
      const refundAmounts = refunds.map((r) => ({
        amount: r.refundTransaction.amount.abs(),
        currencyCode: r.refundTransaction.currencyCode,
      }));
      refundsByCategoryId.set(existingSplit.categoryId, {
        totalRefundedRefAmount: totalRefunded,
        splitId: existingSplit.id,
        refundAmounts,
      });
    }
  }

  // If no splits provided, relink any split-level refunds to main transaction
  if (!splits || splits.length === 0) {
    // Move refunds from split-level to transaction-level (set splitId to null)
    for (const { splitId } of refundsByCategoryId.values()) {
      await RefundTransactions.update({ splitId: null }, { where: { splitId, userId } });
    }
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

      // Validate: if this category had refunds, new refAmount must be >= total refunded
      const existingRefundInfo = refundsByCategoryId.get(split.categoryId);
      if (existingRefundInfo && refAmount.lessThan(existingRefundInfo.totalRefundedRefAmount)) {
        // Format refund amounts in their original currencies for user-friendly display
        const refundDescriptions = existingRefundInfo.refundAmounts.map(
          (r) => `${r.amount.toNumber().toFixed(2)} ${r.currencyCode}`,
        );
        const refundsText = refundDescriptions.join(', ');
        throw new ValidationError({
          message: t({ key: 'transactions.splits.cannotReduceBelowRefunded', variables: { refundsText } }),
        });
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

  // If a category with refunds is being removed, relink those refunds to main transaction
  for (const [categoryId, { splitId }] of refundsByCategoryId) {
    const stillExists = splits.some((s) => s.categoryId === categoryId);
    if (!stillExists) {
      // Move refunds from this split to transaction-level (set splitId to null)
      await RefundTransactions.update({ splitId: null }, { where: { splitId, userId } });
    }
  }

  // Delete existing splits and create new ones (atomic replacement)
  await deleteSplitsForTransaction({ transactionId, userId });
  const createdSplits = await bulkCreateSplits({ data: splitPayloads });

  // Migrate refund links to new split IDs (match by categoryId)
  for (const newSplit of createdSplits) {
    const existingRefundInfo = refundsByCategoryId.get(newSplit.categoryId);
    if (existingRefundInfo) {
      // Update all refund records to point to the new split ID
      await RefundTransactions.update(
        { splitId: newSplit.id },
        {
          where: {
            splitId: existingRefundInfo.splitId,
            userId,
          },
        },
      );
    }
  }

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
  primaryAmount: Money;
  primaryRefAmount: Money;
}> => {
  const splits = await TransactionSplits.findAll({
    where: {
      transactionId: transaction.id,
      userId: transaction.userId,
    },
  });

  const splitsTotal = Money.sum(splits.map((split) => split.amount));
  const splitsRefTotal = Money.sum(splits.map((split) => split.refAmount));

  return {
    splits,
    primaryAmount: transaction.amount.subtract(splitsTotal),
    primaryRefAmount: transaction.refAmount.subtract(splitsRefTotal),
  };
};
