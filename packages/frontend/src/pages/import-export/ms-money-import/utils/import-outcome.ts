import type { MsMoneyImportSummary } from '@bt/shared/types';

/**
 * How the done step reads a finished import:
 * - `success` — rows landed and nothing failed
 * - `partial` — rows landed but some failed
 * - `empty`   — nothing failed and nothing landed (every row was skipped or already existed)
 * - `failure` — nothing landed and something failed
 */
export type MsMoneyImportOutcome = 'success' | 'partial' | 'empty' | 'failure';

/** Rows the import actually wrote. Voided rows land as zero-amount transactions
 *  and are counted separately from `transactionsImported`. */
function countImported({ summary }: { summary: MsMoneyImportSummary }): number {
  return (
    summary.transactionsImported +
    summary.transfersImported +
    summary.outOfWalletImported +
    (summary.voidedImported ?? 0)
  );
}

/**
 * Derives the done step's banner from the summary counts rather than the job
 * status: a job that completes with every row skipped as a duplicate is not a
 * failure, and one that writes some rows while erroring on others is not a
 * plain success. `summary.errors` already includes balance-desync errors.
 */
export function deriveImportOutcome({ summary }: { summary: MsMoneyImportSummary }): MsMoneyImportOutcome {
  const importedCount = countImported({ summary });
  const hasErrors = summary.errors.length > 0;

  if (importedCount > 0) return hasErrors ? 'partial' : 'success';
  return hasErrors ? 'failure' : 'empty';
}
