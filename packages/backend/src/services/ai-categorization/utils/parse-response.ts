import type { RecordId } from '@bt/shared/types';
import { logger } from '@js/utils/logger';

import type { CategorizationResult } from '../types';

/**
 * Parse AI response into categorization results
 */
export function parseCategorizationResponse({
  response,
  validCategoryIds,
  validTransactionIds,
}: {
  response: string;
  validCategoryIds: Set<string>;
  validTransactionIds: Set<string>;
}): CategorizationResult[] {
  const results: CategorizationResult[] = [];
  const lines = response.trim().split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Format: "<transactionId>:<categoryId>" where IDs are UUIDs or other string IDs
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const transactionId = trimmed.slice(0, colonIndex).trim();
    const categoryId = trimmed.slice(colonIndex + 1).trim();

    if (!transactionId || !categoryId) continue;

    // Validate the result
    if (!validTransactionIds.has(transactionId)) {
      logger.info(`AI returned unknown transaction ID: ${transactionId}`);
      continue;
    }
    if (!validCategoryIds.has(categoryId)) {
      logger.info(`AI returned invalid category ID: ${categoryId}`);
      continue;
    }

    results.push({ transactionId, categoryId: categoryId as RecordId });
  }

  return results;
}
