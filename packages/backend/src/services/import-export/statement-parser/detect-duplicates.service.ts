import type { ExtractedTransaction, StatementDuplicateMatch } from '@bt/shared/types';
import {
  type TransactionToCheck,
  detectDuplicates as genericDetectDuplicates,
} from '@root/services/transactions/duplicates-detection/detect-duplicates.service';

interface DetectDuplicatesParams {
  userId: number;
  accountId: number;
  transactions: ExtractedTransaction[];
}

/**
 * Detect duplicate transactions for statement import.
 *
 * This is a wrapper around the generic detectDuplicates service
 * that handles the ExtractedTransaction -> TransactionToCheck mapping
 * and returns StatementDuplicateMatch format.
 */
export async function detectDuplicates({
  userId,
  accountId,
  transactions,
}: DetectDuplicatesParams): Promise<StatementDuplicateMatch[]> {
  // Map ExtractedTransaction to the generic TransactionToCheck format
  // We need to preserve the original transaction for the response
  type ExtractedWithBase = ExtractedTransaction & TransactionToCheck;

  const transactionsToCheck: ExtractedWithBase[] = transactions.map((tx) => ({
    ...tx,
    // ExtractedTransaction already has date, amount, type in the right format
  }));

  const duplicates = await genericDetectDuplicates({
    userId,
    accountId,
    transactions: transactionsToCheck,
  });

  // Map back to StatementDuplicateMatch format
  return duplicates.map((d) => ({
    transactionIndex: d.index,
    extractedTransaction: d.incoming,
    existingTransaction: d.existing,
  }));
}
