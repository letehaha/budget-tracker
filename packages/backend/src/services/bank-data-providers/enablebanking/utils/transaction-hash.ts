import crypto from 'crypto';

import type { EnableBankingTransaction } from '../types';

/**
 * Generate a unique hash for a transaction.
 * Uses entry_reference if available (unique and immutable per account per ASPSP),
 * otherwise falls back to a combination of transaction attributes.
 *
 * IMPORTANT: accountExternalId is included because entry_reference is only unique
 * per account, not globally unique across all accounts.
 *
 * Note: Dates ARE included in the fallback hash because having two genuinely
 * different transactions with identical attributes (same amount, accounts,
 * description) is more common than Enable Banking returning the same transaction
 * with progressively populated date fields without an entry_reference.
 */
export function generateTransactionHash({
  tx,
  accountExternalId,
}: {
  tx: EnableBankingTransaction;
  accountExternalId: string;
}): string {
  // If entry_reference is available, it's the most reliable unique identifier
  // per Enable Banking docs: "unique and immutable for accounts with the same identification hashes"
  // Include accountExternalId since entry_reference is only unique per account
  if (tx.entry_reference) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify({ account: accountExternalId, entry_ref: tx.entry_reference }))
      .digest('hex');
  }

  // Fall back to combination of transaction attributes
  // Including dates for better uniqueness - two identical transactions on different days should be distinct
  const hashData = {
    // Account identifier - ensures global uniqueness
    account_external_id: accountExternalId,
    // Required fields - always present
    amount: tx.transaction_amount.amount,
    currency: tx.transaction_amount.currency,
    credit_debit_indicator: tx.credit_debit_indicator,
    // Date field - use priority-based selection for hash stability
    // This ensures hash stays stable when lower-priority dates are added later
    date: getTransactionDateString({ tx }),
    // Account identifiers (debtor/creditor)
    debtor_account: tx.debtor_account?.iban,
    creditor_account: tx.creditor_account?.iban,
  };

  return crypto.createHash('sha256').update(JSON.stringify(hashData)).digest('hex');
}

/**
 * Get the transaction date as a string using priority-based selection.
 * Used for both hash generation and display date.
 *
 * Priority: transaction_date > value_date > booking_date
 *
 * In real-world banking flow, dates typically follow this chronological order:
 * transaction_date < value_date < booking_date
 * (e.g., card swipe on Jan 15 → funds move Jan 16 → bank books it Jan 17)
 *
 * By selecting in priority order (transaction_date first), we:
 * 1. Get the earliest/most accurate date of when the transaction occurred
 * 2. Ensure hash stability - if transaction_date exists, we always use it,
 *    even if booking_date is added in a subsequent sync
 */
export function getTransactionDateString({ tx }: { tx: EnableBankingTransaction }): string | null {
  return tx.transaction_date || tx.value_date || tx.booking_date || null;
}
