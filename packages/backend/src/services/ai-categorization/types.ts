/**
 * Transaction data sent to AI for categorization
 */
export interface TransactionForCategorization {
  id: number;
  amount: number;
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
 * Result of a categorization batch
 */
export interface CategorizationBatchResult {
  successful: CategorizationResult[];
  failed: number[]; // Transaction IDs that couldn't be categorized
  errors?: string[];
}

/**
 * Parameters for the categorization service
 */
export interface CategorizationParams {
  userId: number;
  transactionIds: number[];
}
