import type { AiCategorizationProgressPayload, CATEGORIZATION_SKIP_REASON } from '@bt/shared/types';
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

/** A row the AI saw but declined to categorize; it gets the run stamp with the reason, category untouched. */
export interface CategorizationSkip {
  transactionId: string;
  reason: CATEGORIZATION_SKIP_REASON;
}

export type CategorizationProgress = Pick<
  AiCategorizationProgressPayload,
  'processedCount' | 'totalCount' | 'failedCount' | 'skippedCount'
>;

/**
 * Result of a categorization batch
 */
export interface CategorizationBatchResult {
  successful: CategorizationResult[];
  skipped: CategorizationSkip[];
  failed: string[]; // Transaction IDs the AI call never resolved (errors, truncation)
  /** Diagnostics only: may carry raw provider strings, so it never reaches the wire. */
  errors?: string[];
  /**
   * The only failure text a client may be shown. Curated copy naming why the run stopped
   * before finishing (endpoint down, model missing, key rejected).
   */
  stopReason?: string;
}
