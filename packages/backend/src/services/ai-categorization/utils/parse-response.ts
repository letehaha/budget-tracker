import { CATEGORIZATION_SKIP_REASON } from '@bt/shared/types';
import { logger } from '@js/utils/logger';

import { CategorizationResult, CategorizationSkip } from '../types';

const SKIP_MARKER = 'skip';

const VALID_SKIP_REASONS = new Set<string>(Object.values(CATEGORIZATION_SKIP_REASON));

/**
 * Models drift from the exact "t1:c4" format: uppercase aliases, markdown emphasis or
 * list bullets around tokens, or a bare row number. Every verdict lost to formatting
 * becomes a permanent `skip:unspecified` stamp, so recover what is still unambiguous.
 */
export function normalizeToken({ raw, aliasPrefix }: { raw: string; aliasPrefix: string }): string {
  const stripped = raw.replace(/^[-*_`\s]+|[-*_`\s]+$/g, '').toLowerCase();
  return /^\d+$/.test(stripped) ? `${aliasPrefix}${stripped}` : stripped;
}

/**
 * Parse the AI response. Each line is either "t1:c4" (categorized) or
 * "t1:skip:transfer" (the model explicitly declined, with a reason code).
 * Rows appearing in neither list gave no verdict — the caller decides their fate.
 */
export function parseCategorizationResponse({
  response,
  validCategoryIds,
  validTransactionIds,
}: {
  response: string;
  validCategoryIds: Set<string>;
  validTransactionIds: Set<string>;
}): { categorized: CategorizationResult[]; skipped: CategorizationSkip[] } {
  const categorized: CategorizationResult[] = [];
  const skipped: CategorizationSkip[] = [];
  const lines = response.trim().split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Format: "<transactionId>:<verdict>" where IDs are short aliases like "t12"
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const transactionId = normalizeToken({ raw: trimmed.slice(0, colonIndex), aliasPrefix: 't' });
    const verdict = normalizeToken({ raw: trimmed.slice(colonIndex + 1), aliasPrefix: 'c' });

    if (!transactionId || !verdict) continue;

    if (!validTransactionIds.has(transactionId)) {
      logger.info(`AI returned unknown transaction ID: ${transactionId}`);
      continue;
    }

    if (verdict === SKIP_MARKER || verdict.startsWith(`${SKIP_MARKER}:`)) {
      const reason = verdict.slice(SKIP_MARKER.length + 1).trim();
      skipped.push({
        transactionId,
        reason: VALID_SKIP_REASONS.has(reason)
          ? (reason as CATEGORIZATION_SKIP_REASON)
          : CATEGORIZATION_SKIP_REASON.unspecified,
      });
      continue;
    }

    if (!validCategoryIds.has(verdict)) {
      logger.info(`AI returned invalid category ID: ${verdict}`);
      continue;
    }

    categorized.push({ transactionId, categoryId: verdict });
  }

  return { categorized, skipped };
}
