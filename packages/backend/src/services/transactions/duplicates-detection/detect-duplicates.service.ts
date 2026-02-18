import { TRANSACTION_TYPES } from '@bt/shared/types';
import { rawCents } from '@common/types/money';
import * as Transactions from '@models/Transactions.model';

/**
 * Generic transaction interface for duplicate detection.
 * Any service can use this by mapping their transaction format to this interface.
 */
export interface TransactionToCheck {
  /** Date in YYYY-MM-DD or YYYY-MM-DD HH:MM:SS format */
  date: string;
  /** Amount in system format (integer, cents) */
  amount: number;
  /** Transaction type */
  type: 'income' | 'expense';
}

/**
 * Existing transaction that matched as a duplicate
 */
export interface ExistingTransactionMatch {
  id: number;
  date: string;
  amount: number;
  note: string;
}

/**
 * A duplicate match result.
 * Generic over T to preserve the original transaction data.
 */
export interface DuplicateMatch<T> {
  /** Index in the input transactions array */
  index: number;
  /** The incoming transaction that was checked */
  incoming: T;
  /** The existing transaction in the database that it matches */
  existing: ExistingTransactionMatch;
}

export interface DetectDuplicatesParams<T extends TransactionToCheck> {
  userId: number;
  accountId: number;
  /** Transactions to check for duplicates */
  transactions: T[];
}

/**
 * Detect duplicate transactions by comparing against existing transactions in an account.
 *
 * Matching criteria:
 * - Same date (day only, ignores time)
 * - Same amount (exact match)
 * - Same transaction type (income/expense)
 *
 * This is intentionally simple and doesn't use description matching because:
 * - Bank statements often have different description formats
 * - Users may have manually entered transactions with different notes
 * - False negatives are preferable to false positives (better to import a duplicate than skip a valid transaction)
 *
 * @example
 * // Statement parser usage
 * const duplicates = await detectDuplicates({
 *   userId,
 *   accountId,
 *   transactions: extractedTransactions.map(tx => ({
 *     date: tx.date,
 *     amount: tx.amount,
 *     type: tx.type,
 *   })),
 * });
 *
 * @example
 * // Bank sync usage
 * const duplicates = await detectDuplicates({
 *   userId,
 *   accountId,
 *   transactions: bankTransactions.map(tx => ({
 *     date: tx.bookingDate,
 *     amount: Math.abs(tx.amount),
 *     type: tx.amount > 0 ? 'income' : 'expense',
 *   })),
 * });
 */
export async function detectDuplicates<T extends TransactionToCheck>({
  userId,
  accountId,
  transactions,
}: DetectDuplicatesParams<T>): Promise<DuplicateMatch<T>[]> {
  const duplicates: DuplicateMatch<T>[] = [];

  if (transactions.length === 0) {
    return duplicates;
  }

  // Get date range from transactions
  const dates = transactions.map((t) => t.date.split(' ')[0]!);
  const minDate = dates.reduce((a, b) => (a < b ? a : b));
  const maxDate = dates.reduce((a, b) => (a > b ? a : b));

  // Add one day to maxDate to include all transactions on the last day
  // (because findWithFilters uses new Date(endDate) which is midnight, excluding later hours)
  const maxDatePlusOne = new Date(maxDate);
  maxDatePlusOne.setDate(maxDatePlusOne.getDate() + 1);
  const endDateStr = maxDatePlusOne.toISOString().split('T')[0]!;

  // Fetch existing transactions in the date range for this account
  const existingTransactions = await Transactions.findWithFilters({
    userId,
    accountIds: [accountId],
    startDate: minDate,
    endDate: endDateStr,
    from: 0,
    limit: 10000,
    isRaw: true,
  });

  // Build lookup map for efficient matching: key = "date:amount:type"
  const existingMap = new Map<string, Transactions.default[]>();
  for (const tx of existingTransactions) {
    const dateStr = new Date(tx.time).toISOString().split('T')[0];
    const type = tx.transactionType === TRANSACTION_TYPES.income ? 'income' : 'expense';
    const key = `${dateStr}:${Math.abs(rawCents(tx.amount))}:${type}`;

    if (!existingMap.has(key)) {
      existingMap.set(key, []);
    }
    existingMap.get(key)!.push(tx);
  }

  // Check each transaction for duplicates
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i]!;
    const dateStr = tx.date.split(' ')[0]!;
    const key = `${dateStr}:${tx.amount}:${tx.type}`;

    const candidates = existingMap.get(key);
    if (!candidates || candidates.length === 0) {
      continue;
    }

    // Found at least one match - use the first one
    const bestMatch = candidates[0]!;

    duplicates.push({
      index: i,
      incoming: tx,
      existing: {
        id: bestMatch.id,
        date: new Date(bestMatch.time).toISOString().split('T')[0]!,
        amount: Math.abs(rawCents(bestMatch.amount)),
        note: bestMatch.note || '',
      },
    });
  }

  return duplicates;
}
