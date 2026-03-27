import { Money } from '@common/types/money';

/**
 * Transaction data sent to AI for categorization
 */
export interface TransactionForCategorization {
  id: number;
  amount: Money;
  currencyCode: string;
  accountName: string;
  datetime: string;
  note: string | null;
}

/**
 * Category data sent to AI
 */
export interface CategoryForCategorization {
  id: number;
  parentId: number | null;
  name: string;
}

/**
 * AI categorization result for a single transaction
 */
export interface CategorizationResult {
  transactionId: number;
  categoryId: number;
}

/**
 * AI tag suggestion result for a single transaction
 */
export interface TagSuggestionResult {
  transactionId: number;
  tagId: number;
}

/**
 * Result of a categorization batch
 */
export interface CategorizationBatchResult {
  successful: CategorizationResult[];
  failed: number[]; // Transaction IDs that couldn't be categorized
  errors?: string[];
  /**
   * Tag suggestions from AI.
   * - `undefined`: tag matching was not enabled for this batch
   * - `[]`: tag matching was enabled but no matches found
   * - populated: tag matches found
   */
  tagSuggestions?: TagSuggestionResult[];
}
