/**
 * Statement Parser types
 * Types for AI-powered bank statement extraction from PDF, CSV, TXT files
 */

/**
 * Supported file types for statement parsing
 */
export type StatementFileType = 'pdf' | 'csv' | 'txt';

/**
 * Single extracted transaction from statement
 */
export interface ExtractedTransaction {
  /** Transaction date in YYYY-MM-DD or YYYY-MM-DD HH:MM:SS format */
  date: string;
  /** Original description from statement */
  description: string;
  /** Transaction amount (always positive) */
  amount: number;
  /** Transaction type: income or expense */
  type: 'income' | 'expense';
  /** Running balance after transaction (if available) */
  balance?: number;
  /** Extraction confidence score 0.0-1.0 */
  confidence: number;
}

/**
 * Metadata extracted from statement
 */
export interface ExtractedMetadata {
  /** Bank name if identified */
  bankName?: string;
  /** Last 4 digits of account number if found */
  accountNumberLast4?: string;
  /** Statement period */
  statementPeriod?: {
    from: string;
    to: string;
  };
  /** Detected currency code (e.g., 'USD', 'EUR') */
  currencyCode?: string;
}

/**
 * Result of AI extraction from statement file
 */
export interface StatementExtractionResult {
  /** Extracted transactions */
  transactions: ExtractedTransaction[];
  /** Extracted metadata */
  metadata: ExtractedMetadata;
  /** Total pages (for PDF) or 1 for text files */
  pageCount: number;
  /** Detected file type */
  fileType: StatementFileType;
  /** Approximate token count for cost display */
  tokenCount: {
    input: number;
    output: number;
  };
}

/**
 * Cost estimate before processing
 */
export interface StatementCostEstimate {
  /** Estimated input tokens */
  estimatedInputTokens: number;
  /** Estimated output tokens (based on expected transactions) */
  estimatedOutputTokens: number;
  /** Estimated cost in USD */
  estimatedCostUsd: number;
  /** Model that will be used */
  modelId: string;
  /** Model display name */
  modelName: string;
  /** Whether using user's API key */
  usingUserKey: boolean;
  /** Text extraction details */
  textExtraction: {
    /** Whether text extraction was successful */
    success: boolean;
    /** Extracted text character count */
    characterCount: number;
    /** Number of pages (for PDF) or 1 */
    pageCount: number;
  };
  /** Detected file type */
  fileType: StatementFileType;
  /** Token limit info */
  tokenLimit?: {
    /** Maximum allowed input tokens (model context / 3) */
    maxInputTokens: number;
    /** Whether the file exceeds the limit */
    exceedsLimit: boolean;
  };
}

/**
 * Request for statement extraction
 */
export interface StatementExtractRequest {
  /** Base64 encoded file content */
  fileBase64: string;
}

/**
 * Error response for statement extraction
 */
export interface StatementExtractError {
  /** Error code for frontend handling */
  code:
    | 'NO_AI_CONFIGURED'
    | 'INVALID_FILE'
    | 'FILE_TOO_LARGE'
    | 'EXTRACTION_FAILED'
    | 'NO_TRANSACTIONS_FOUND'
    | 'AI_ERROR'
    | 'RATE_LIMITED'
    | 'TOKEN_LIMIT_EXCEEDED';
  /** Human-readable error message */
  message: string;
  /** Additional details */
  details?: string;
}

// Re-export old names for backward compatibility during migration
// TODO: Remove these after full migration
/** @deprecated Use StatementExtractionResult instead */
export type PDFExtractionResult = StatementExtractionResult;
/** @deprecated Use StatementCostEstimate instead */
export type PDFCostEstimate = StatementCostEstimate;
/** @deprecated Use StatementExtractRequest instead */
export type PDFExtractRequest = StatementExtractRequest;
/** @deprecated Use StatementExtractError instead */
export type PDFExtractError = StatementExtractError;
