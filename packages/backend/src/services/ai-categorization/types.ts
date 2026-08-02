import type { AiCategorizationProgressPayload } from '@bt/shared/types';
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
  payeeName: string | null;
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

export type CategorizationProgress = Pick<
  AiCategorizationProgressPayload,
  'processedCount' | 'totalCount' | 'failedCount'
>;

/**
 * Result of a categorization batch
 */
export interface CategorizationBatchResult {
  successful: CategorizationResult[];
  failed: string[]; // Transaction IDs that couldn't be categorized
  /** Diagnostics only: may carry raw provider strings, so it never reaches the wire. */
  errors?: string[];
  /**
   * The only failure text a client may be shown. Curated copy naming why the run stopped
   * before finishing (endpoint down, model missing, key rejected).
   */
  stopReason?: string;
}
