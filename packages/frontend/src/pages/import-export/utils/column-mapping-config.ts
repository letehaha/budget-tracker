/**
 * Projects the wizard's working `ColumnMapping` onto the always-complete
 * `ColumnMappingConfig` wire payload sent to the backend.
 *
 * The working mapping allows `null` for not-yet-chosen fields; the wire payload
 * does not. This is the single place that crosses that boundary: it returns the
 * payload when every required field is present, or `null` when any is still
 * unset. Keeping it here means `detectDuplicates` and `extractUniqueValues`
 * share one projection instead of repeating non-null assertions that can drift
 * out of sync with each other.
 */
import type { ColumnMappingConfig } from '@bt/shared/types';

import type { ColumnMapping } from './build-initial-mapping';

export function toColumnMappingConfig({ mapping }: { mapping: ColumnMapping }): ColumnMappingConfig | null {
  const { date, amount, category, account, currency, transactionType } = mapping;

  // transactionType is always set; the rest are nullable until the user (or
  // auto-match) chooses a method, so a missing one means the mapping is incomplete.
  if (!date || !amount || !category || !account || !currency) {
    return null;
  }

  return {
    date,
    amount,
    description: mapping.description || undefined,
    payee: mapping.payee || undefined,
    category,
    tags: mapping.tags ?? undefined,
    account,
    currency,
    transactionType,
  };
}
