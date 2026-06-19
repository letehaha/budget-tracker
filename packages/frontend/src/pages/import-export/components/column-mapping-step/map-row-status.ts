/**
 * Pure helpers that turn the wizard's working column-mapping state into the
 * per-row `StatusIndicator` status shown in the Map Columns tables.
 *
 * The status is derived from two inputs:
 *   - the automatic match confidence (`ColumnMatch.confidence` from auto-match)
 *   - whether the field currently holds a value the user/auto-match supplied
 *
 * Status meanings:
 *   - 'auto-matched'    high-confidence auto-fill (exact / starts-with) OR a
 *                       value the user picked manually (no match record)
 *   - 'suggested'       low-confidence auto-fill (contains) — confirm
 *   - 'needs-attention' required field with no value yet
 *   - 'optional'        optional field intentionally left empty
 *
 * Kept Vue/Pinia-free so it can be unit-tested in isolation.
 */
import type { ColumnMatch } from '@/pages/import-export/utils/auto-match';

/** The subset of `StatusIndicator` statuses the Map step produces. */
export type MapRowStatus = 'auto-matched' | 'suggested' | 'needs-attention' | 'optional';

/**
 * Derives a row status from the field's value-presence and its auto-match record.
 *
 * - No value:
 *     required  ⇒ 'needs-attention'
 *     optional  ⇒ 'optional'
 * - Has a value:
 *     matched 'contains'           ⇒ 'suggested'   (low confidence)
 *     matched 'exact'/'starts-with' or no match record (user-picked) ⇒ 'auto-matched'
 */
export function deriveMapRowStatus({
  hasValue,
  required,
  match,
}: {
  hasValue: boolean;
  required: boolean;
  match: ColumnMatch;
}): MapRowStatus {
  if (!hasValue) {
    return required ? 'needs-attention' : 'optional';
  }

  if (match?.confidence === 'contains') {
    return 'suggested';
  }

  // 'exact' / 'starts-with' auto-matches and any user-chosen value (no match
  // record) are both treated as confidently filled.
  return 'auto-matched';
}
