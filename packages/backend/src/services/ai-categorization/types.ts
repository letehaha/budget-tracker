import { Money } from '@common/types/money';

/**
 * Transaction data sent to AI for categorization
 */
export interface TransactionForCategorization {
  id: string;
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
  id: string;
  parentId: string | null;
  name: string;
}

/**
 * AI categorization result for a single transaction
 */
export interface CategorizationResult {
  transactionId: string;
  categoryId: string;
}

/**
 * Result of a categorization batch
 */
export interface CategorizationBatchResult {
  successful: CategorizationResult[];
  failed: string[]; // Transaction IDs that couldn't be categorized
  errors?: string[];
}
