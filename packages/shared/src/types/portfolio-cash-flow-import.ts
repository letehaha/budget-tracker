/**
 * Portfolio cash-flow import types.
 *
 * AI-powered import of deposit / withdrawal events into a portfolio. Flow:
 * extract → detect-duplicates → execute. Operates on PortfolioTransfers
 * instead of Transactions, and supports a per-row "isHistorical" flag so
 * users can backfill cash flows from before they started tracking without
 * affecting the current cash balance.
 */

export type CashFlowDirection = 'deposit' | 'withdrawal';

/**
 * Single cash-flow event extracted by the AI from the user's pasted text.
 * `sourceLine` is the raw input fragment the AI matched against — the review
 * UI surfaces it so users can sanity-check what the model latched onto.
 */
export interface ExtractedCashFlowRow {
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Always positive */
  amount: number;
  /** ISO 4217 currency code (e.g. "USD", "EUR") */
  currencyCode: string;
  direction: CashFlowDirection;
  /** Optional verbatim line from the source the AI took this row from */
  sourceLine?: string;
  /** Optional free-text note for the row (passed through to the transfer) */
  description?: string;
}

/**
 * Result of an AI extraction call.
 */
export interface CashFlowExtractionResult {
  rows: ExtractedCashFlowRow[];
  modelId: string;
  modelName: string;
  usingUserKey: boolean;
  tokenCount: {
    input: number;
    output: number;
  };
}

/**
 * One match against an existing PortfolioTransfer row. The frontend uses
 * `existingTransferId` to lazily fetch the matched record's details for the
 * tooltip in the review step.
 */
export interface CashFlowDuplicateMatch {
  rowIndex: number;
  existingTransferId: number;
  existingDate: string;
  existingAmount: string;
  existingCurrencyCode: string;
  existingDirection: CashFlowDirection;
}

export interface CashFlowDetectDuplicatesResponse {
  duplicates: CashFlowDuplicateMatch[];
}

/**
 * Per-row payload for the execute endpoint. The AI-suggested rows are
 * augmented client-side with the user's per-row choices.
 */
export interface CashFlowExecuteRow {
  date: string;
  amount: string;
  currencyCode: string;
  direction: CashFlowDirection;
  isHistorical: boolean;
  description?: string | null;
}

export interface CashFlowExecuteRequest {
  portfolioId: number;
  rows: CashFlowExecuteRow[];
}

export interface CashFlowImportError {
  rowIndex: number;
  error: string;
}

export interface CashFlowExecuteResponse {
  imported: number;
  errors: CashFlowImportError[];
  newTransferIds: number[];
}
