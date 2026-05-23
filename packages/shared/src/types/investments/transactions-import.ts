/**
 * Types for AI-powered investment transactions import.
 *
 * Pipeline mirrors `statement-parser` for bank statements:
 *   file (or pasted text) → text extract → AI parse → review/edit → execute
 *
 * One key difference: review is hierarchical. AI returns a flat list of
 * transactions; the server groups them by parsed symbol into "holding rows"
 * (the parents) with the original transactions hanging off them as children.
 * The user edits both levels and commits.
 */
import type { StatementFileType } from '../statement-parser';
import type { ASSET_CLASS } from './enums';

/**
 * Asset classes the import endpoint will accept. v1 supports crypto only;
 * `securities` is reserved for the upcoming stocks parser and currently
 * returns NOT_IMPLEMENTED.
 */
export type InvestmentImportAssetClass = ASSET_CLASS.crypto | ASSET_CLASS.stocks;

/**
 * Result of resolving an AI-parsed symbol to a CoinGecko/FMP/etc security.
 * - `auto`: server picked a single confident match (user can still override).
 * - `ambiguous`: provider returned multiple plausible candidates; user must pick.
 * - `unmapped`: no provider candidate at all (typo, dead token); user must pick or delete.
 */
export type SymbolResolutionConfidence = 'auto' | 'ambiguous' | 'unmapped';

export interface ResolvedSecurityRef {
  /** Existing Security.id if the security already lives in our DB. */
  securityId: string | null;
  /** Canonical provider symbol (CoinGecko coin slug for crypto). */
  providerSymbol: string;
  /** Display ticker. */
  symbol: string;
  /** Display name. */
  name: string;
  /** Whether the security row already exists in DB (vs has to be created at execute). */
  alreadyInDb: boolean;
}

export interface InvestmentImportTransaction {
  /** Stable UI key (not persisted). */
  tempId: string;
  /** YYYY-MM-DD, UTC (server collapses any AI-returned time-of-day). */
  date: string;
  /** Direction of the trade. */
  side: 'buy' | 'sell';
  /** Decimal string (Money convention). */
  quantity: string;
  /** Decimal string. */
  price: string;
  /** Decimal string. 0 if AI didn't extract a fee. */
  fees: string;
  /** Computed convenience: `quantity * price + fees`, decimal string. */
  amount: string;
  /**
   * If this transaction is a possible duplicate of an existing one, the
   * id of the existing transaction. UI shows a badge; user can opt to skip.
   */
  possibleDuplicateOf: string | null;
}

export interface InvestmentImportHolding {
  /** Stable UI key (not persisted). */
  tempId: string;

  /** Raw symbol the AI returned (e.g. "BTC", "SOL/USDT"). */
  parsedSymbol: string;
  /** Raw name the AI returned, if any (e.g. "Bitcoin"). */
  parsedName: string | null;

  /** Server-resolved security (null until user picks). */
  resolvedSecurity: ResolvedSecurityRef | null;
  resolvedConfidence: SymbolResolutionConfidence;

  /** Target portfolio for this holding's transactions. */
  portfolioId: string;
  /**
   * Fiat currency the cash side of the trade is denominated in (USD, EUR, …).
   * null = invalid (crypto-quoted pair, unknown token); blocks commit.
   */
  currencyCode: string | null;
  /**
   * Whether the target portfolio already has a holding for this security.
   * Holdings have a composite PK `(portfolioId, securityId)` so we surface the
   * merge intent as a boolean rather than an id. The executor re-derives the
   * actual row from `(portfolioId, securityId)` at commit time.
   */
  hasExistingHolding: boolean;

  transactions: InvestmentImportTransaction[];
}

export interface InvestmentImportExtractionResult {
  /** Hierarchical: one row per parsed security with child transactions. */
  holdings: InvestmentImportHolding[];
  /** Human-readable warnings (e.g. "12 rows had no symbol — skipped"). */
  warnings: string[];
  /** Detected file type (matches statement-parser). */
  fileType: StatementFileType;
  /** Approximate token usage from the AI call. */
  tokenCount: {
    input: number;
    output: number;
  };
}

export interface InvestmentImportError {
  code:
    | 'NO_AI_CONFIGURED'
    | 'INVALID_FILE'
    | 'FILE_TOO_LARGE'
    | 'EXTRACTION_FAILED'
    | 'NO_TRANSACTIONS_FOUND'
    | 'AI_ERROR'
    | 'RATE_LIMITED'
    | 'TOKEN_LIMIT_EXCEEDED'
    | 'NOT_IMPLEMENTED';
  message: string;
  details?: string;
}

/* ---------- request shapes ---------- */

export interface InvestmentImportEstimateCostRequest {
  fileBase64: string;
  assetClass: InvestmentImportAssetClass;
}

export interface InvestmentImportExtractRequest {
  fileBase64: string;
  assetClass: InvestmentImportAssetClass;
  /** Pre-selected by the entry point (portfolio page) — server uses this as the
   * default `portfolioId` on every parsed holding row. */
  defaultPortfolioId: string;
}

export interface InvestmentImportExecuteRequest {
  assetClass: InvestmentImportAssetClass;
  /** The (validated, possibly user-edited) holdings to commit. */
  holdings: InvestmentImportHolding[];
  /** tempIds of transactions the user opted to skip (possible duplicates). */
  skipTempIds: string[];
}

/* ---------- response shapes ---------- */

export interface InvestmentImportExecuteResponse {
  createdSecurities: number;
  createdHoldings: number;
  mergedHoldings: number;
  createdTransactions: number;
  /** Transactions whose `tempId` was in `skipTempIds` (user marked them as dups). */
  skippedPossibleDuplicates: number;
  /** Holdings the server refused to commit (unresolved security, missing currency,
   * portfolio not owned by user, security row could not be created). */
  skippedHoldings: number;
  /** Transactions that threw inside `createInvestmentTransaction` after passing
   * validation. Counted separately from successful creates so the summary
   * doesn't claim a full import when some rows actually failed. */
  failedTransactions: number;
  /** Human-readable details about anything that was skipped/failed. Empty when
   * everything imported cleanly. */
  warnings: string[];
}
