import { logger } from '@js/utils/logger';

import { CategorizationResult, TagSuggestionResult } from '../types';

/**
 * Parse AI response into categorization results.
 * Supports both legacy format (transactionId:categoryId) and
 * combined format (C:transactionId:categoryId / T:transactionId:tagId).
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

    // Skip tag lines in the categorization parser
    if (trimmed.startsWith('T:')) continue;

    // Combined format (C:txId:catId) or legacy format (txId:catId)
    const match = trimmed.match(/^(?:C:)?(\d+):(\d+)$/);
    if (!match) continue;

    const transactionId = parseInt(match[1]!, 10);
    const categoryId = parseInt(match[2]!, 10);

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

/**
 * Parse AI response for tag suggestions.
 * Extracts T:transactionId:tagId lines from the combined response.
 */
export function parseTagSuggestionResponse({
  response,
  validTagIds,
  validTransactionIds,
}: {
  response: string;
  validTagIds: Set<number>;
  validTransactionIds: Set<number>;
}): TagSuggestionResult[] {
  const results: TagSuggestionResult[] = [];
  const lines = response.trim().split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^T:(\d+):(\d+)$/);
    if (!match) continue;

    const transactionId = parseInt(match[1]!, 10);
    const tagId = parseInt(match[2]!, 10);

    if (!validTransactionIds.has(transactionId)) {
      logger.warn(`AI returned unknown transaction ID for tag: ${transactionId}`);
      continue;
    }
    if (!validTagIds.has(tagId)) {
      logger.warn(`AI returned invalid tag ID: ${tagId}`);
      continue;
    }

    results.push({ transactionId, tagId });
  }

  return results;
}
