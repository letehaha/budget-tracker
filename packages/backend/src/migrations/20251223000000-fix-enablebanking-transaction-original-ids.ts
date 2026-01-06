import crypto from 'crypto';
import { AbstractQueryInterface, QueryTypes } from '@sequelize/core';

/**
 * Migration to fix Enable Banking transaction originalId values.
 *
 * The hash generation algorithm was updated to:
 * 1. Include accountExternalId (entry_reference is only unique per account, not globally)
 * 2. Use priority-based date selection (transaction_date > value_date > booking_date)
 *
 * This migration recalculates originalId for all existing Enable Banking transactions
 * using the new algorithm to prevent duplicates on future syncs.
 */

interface EnableBankingTransaction {
  entry_reference?: string;
  transaction_amount: {
    amount: string;
    currency: string;
  };
  credit_debit_indicator: string;
  transaction_date?: string;
  value_date?: string;
  booking_date?: string;
  debtor_account?: {
    iban?: string;
  };
  creditor_account?: {
    iban?: string;
  };
}

interface TransactionRow {
  id: number;
  accountId: number;
  externalData: {
    rawTransaction?: EnableBankingTransaction;
    entryReference?: string;
    transactionDate?: string;
    valueDate?: string;
    bookingDate?: string;
  } | null;
  accountExternalId: string;
}

/**
 * Get the transaction date string using priority-based selection.
 * Priority: transaction_date > value_date > booking_date
 */
function getTransactionDateString(tx: EnableBankingTransaction): string | null {
  return tx.transaction_date || tx.value_date || tx.booking_date || null;
}

/**
 * Generate unique hash for a transaction using the new algorithm.
 */
function generateTransactionHash({
  tx,
  accountExternalId,
}: {
  tx: EnableBankingTransaction;
  accountExternalId: string;
}): string {
  // If entry_reference is available, it's the most reliable unique identifier
  if (tx.entry_reference) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify({ account: accountExternalId, entry_ref: tx.entry_reference }))
      .digest('hex');
  }

  // Fall back to combination of transaction attributes
  const hashData = {
    account_external_id: accountExternalId,
    amount: tx.transaction_amount.amount,
    currency: tx.transaction_amount.currency,
    credit_debit_indicator: tx.credit_debit_indicator,
    date: getTransactionDateString(tx),
    debtor_account: tx.debtor_account?.iban,
    creditor_account: tx.creditor_account?.iban,
  };

  return crypto.createHash('sha256').update(JSON.stringify(hashData)).digest('hex');
}

module.exports = {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    const sequelize = queryInterface.sequelize;

    // Fetch all Enable Banking transactions with their account's externalId
    const transactions = await sequelize.query<TransactionRow>(
      `
      SELECT
        t.id,
        t."accountId",
        t."externalData",
        a."externalId" as "accountExternalId"
      FROM "Transactions" t
      INNER JOIN "Accounts" a ON t."accountId" = a.id
      WHERE t."accountType" = 'enable-banking'
        AND t."externalData" IS NOT NULL
      `,
      { type: QueryTypes.SELECT },
    );

    if (process.env.NODE_ENV !== 'test') {
      console.log(`Found ${transactions.length} Enable Banking transactions to migrate`);
    }

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const tx of transactions) {
      try {
        // Get rawTransaction from externalData
        const rawTransaction = tx.externalData?.rawTransaction;

        if (!rawTransaction) {
          // Try to reconstruct from parsed fields if rawTransaction is missing
          const entryReference = tx.externalData?.entryReference;

          if (entryReference && tx.accountExternalId) {
            // Can generate hash from entry_reference
            const newOriginalId = crypto
              .createHash('sha256')
              .update(JSON.stringify({ account: tx.accountExternalId, entry_ref: entryReference }))
              .digest('hex');

            await sequelize.query(`UPDATE "Transactions" SET "originalId" = :newOriginalId WHERE id = :id`, {
              replacements: { newOriginalId, id: tx.id },
              type: QueryTypes.UPDATE,
            });
            updated++;
          } else {
            console.warn(`Transaction ${tx.id}: Missing rawTransaction and entry_reference, skipping`);
            skipped++;
          }
          continue;
        }

        if (!tx.accountExternalId) {
          console.warn(`Transaction ${tx.id}: Missing accountExternalId, skipping`);
          skipped++;
          continue;
        }

        // Generate new originalId using the updated algorithm
        const newOriginalId = generateTransactionHash({
          tx: rawTransaction,
          accountExternalId: tx.accountExternalId,
        });

        // Update the transaction
        await sequelize.query(`UPDATE "Transactions" SET "originalId" = :newOriginalId WHERE id = :id`, {
          replacements: { newOriginalId, id: tx.id },
          type: QueryTypes.UPDATE,
        });

        updated++;
      } catch (error) {
        console.error(`Error migrating transaction ${tx.id}:`, error);
        errors++;
      }
    }

    if (process.env.NODE_ENV !== 'test') {
      console.log(`Migration complete: ${updated} updated, ${skipped} skipped, ${errors} errors`);
    }
  },

  down: async (): Promise<void> => {
    // This migration cannot be easily reversed as we don't store the old originalId values.
    // The down migration is a no-op. If needed, transactions would need to be re-synced
    // from Enable Banking to regenerate the old hash format.
    console.log('Down migration is a no-op. To revert, you would need to re-sync transactions from Enable Banking.');
  },
};
