import { logger } from '@js/utils/logger';

import { CategorizationResult } from '../types';

/**
 * Parse AI response into categorization results
 */
export function parseCategorizationResponse({
  response,
  validCategoryIds,
  validTransactionIds,
}: {
  response: string;
  validCategoryIds: Set<number>;
  validTransactionIds: Set<number>;
}): CategorizationResult[] {
  const results: CategorizationResult[] = [];
  const lines = response.trim().split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^(\d+):(\d+)$/);
    if (!match) continue;

    const transactionId = parseInt(match[1]!, 10);
    const categoryId = parseInt(match[2]!, 10);

    // Validate the result
    if (!validTransactionIds.has(transactionId)) {
      logger.warn(`AI returned unknown transaction ID: ${transactionId}`);
      continue;
    }
    if (!validCategoryIds.has(categoryId)) {
      logger.warn(`AI returned invalid category ID: ${categoryId}`);
      continue;
    }

    results.push({ transactionId, categoryId });
  }

  return results;
}
