import type { ExtractedTransaction, StatementDuplicateMatch } from '@bt/shared/types';
import { Money, centsToApiDecimal } from '@common/types/money';
import { detectDuplicates as genericDetectDuplicates } from '@root/services/transactions/duplicates-detection/detect-duplicates.service';

interface DetectDuplicatesParams {
  userId: number;
  accountId: string;
  transactions: ExtractedTransaction[];
}

/**
 * Detect duplicate transactions for statement import.
 *
 * Extracted amounts are decimals (same format execute-import accepts), while the
 * generic matcher compares cents, so amounts are converted on the way in and out.
 */
export async function detectDuplicates({
  userId,
  accountId,
  transactions,
}: DetectDuplicatesParams): Promise<StatementDuplicateMatch[]> {
  const duplicates = await genericDetectDuplicates({
    userId,
    accountId,
    transactions: transactions.map((tx) => ({ ...tx, amount: Money.fromDecimal(tx.amount).toCents() })),
  });

  return duplicates.map((d) => ({
    transactionIndex: d.index,
    extractedTransaction: transactions[d.index]!,
    existingTransaction: { ...d.existing, amount: centsToApiDecimal(d.existing.amount) },
  }));
}
