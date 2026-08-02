/**
 * Shared contracts for the Microsoft Money (.mny) import pipeline. Lives in the
 * shared package so backend (decrypt, parse, queue, controllers) and frontend
 * (wizard UI, Pinia store, API client) stay in sync.
 *
 * Monetary values cross the wire as decimals — the convention for HTTP
 * boundaries in this codebase.
 *
 * Unlike the CSV-family importers, a `.mny` file is a binary database that is
 * uploaded once and parsed once. The parse result is cached server-side under
 * an `uploadId`; every later step references that id instead of re-sending the
 * file. See `MsMoneyUploadResponse`.
 */

import { TRANSACTION_TYPES } from './enums';
import { IMPORT_JOB_STATUSES } from './import-export';
import type {
  CategoryMappingConfig,
  DuplicateMatch,
  ImportError,
  ImportErrorCode,
  ImportExecuteRequestBase,
  ImportJobStatus,
  ImportSummaryBase,
} from './import-export';

/** Largest `.mny` upload accepted, in bytes. Money files grow with history;
 *  50MB covers a very long-running file while staying well inside what the
 *  API host can buffer without memory pressure. */
export const MS_MONEY_MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Hard cap on transactions the parser will surface, so one rogue file cannot
 *  exhaust memory building the preview. */
export const MS_MONEY_MAX_ROWS = 100_000;

/** How long a parsed upload stays retrievable before the sweeper deletes it.
 *  Long enough for a user to work through the wizard unhurried, short enough
 *  that abandoned uploads do not accumulate on disk. */
export const MS_MONEY_UPLOAD_TTL_MS = 60 * 60 * 1000;

/**
 * Money's internal account-type codes (`ACCT.at`). Values are Microsoft's, not
 * ours — they are read from the file and mapped to a support decision.
 */
export enum MsMoneyAccountType {
  banking = 0,
  creditCard = 1,
  cash = 2,
  asset = 3,
  liability = 4,
  investment = 5,
  loan = 6,
}

/**
 * Account types this importer brings across. Investment and loan accounts are
 * excluded: investments belong to the portfolios feature rather than the
 * transaction ledger, and loan accounts are a dedicated flow that rejects
 * imported rows. Both are reported as skip warnings instead of failing.
 */
export const MS_MONEY_SUPPORTED_ACCOUNT_TYPES: readonly MsMoneyAccountType[] = [
  MsMoneyAccountType.banking,
  MsMoneyAccountType.creditCard,
  MsMoneyAccountType.cash,
  MsMoneyAccountType.asset,
  MsMoneyAccountType.liability,
];

// ---------------------------------------------------------------------------
// Parse-result types (what the parser returns and the preview step renders)
// ---------------------------------------------------------------------------

/** An importable account discovered in the file. */
export interface MsMoneyParseAccount {
  /** Money's account name (`ACCT.szFull`) — the join key in the mapping payload. */
  originalName: string;
  /** ISO code resolved through Money's currency table. */
  currency: string;
  accountType: MsMoneyAccountType;
  /** Rows belonging to this account, including transfer legs. Informational. */
  transactionCount: number;
  /** Signed sum of this account's imported rows. Informational for the preview —
   *  the execute step derives real balances from the created transactions. */
  netImportedAmount: number;
}

/**
 * A category the file actually uses. Money categories are two levels deep under
 * fixed INCOME/EXPENSE roots, so a category is either a group (`groupName` null)
 * or a leaf inside one.
 */
export interface MsMoneyParseCategory {
  /** Full display path — `"Auto:Gas"` for a leaf, `"Auto"` for a group. This is
   *  the key used in `categoryMapping`. */
  fullName: string;
  /** Leaf name on its own (`"Gas"`). */
  name: string;
  /** Parent group name, or null when the category is itself a group. */
  groupName: string | null;
  transactionCount: number;
}

/** A payee referenced by at least one imported row. */
export interface MsMoneyParsePayee {
  name: string;
  transactionCount: number;
}

/**
 * One ordinary transaction, or an unpaired transfer leg imported as an
 * out-of-wallet transaction.
 *
 * Money stores split transactions as a parent row plus child rows carrying the
 * real per-category detail. The parser drops the parents and surfaces the
 * children as ordinary transactions, so `amount` here is always a leaf value.
 */
export interface MsMoneyParseTransaction {
  /** Stable index within this parse result. Duplicate-skip decisions reference it. */
  rowIndex: number;
  /** Money's own transaction id (`TRN.htrn`), for support and traceability. */
  sourceId: number;
  /** ISO instant. Money stores a plain calendar date, anchored here to UTC midnight. */
  date: string;
  accountName: string;
  /** Full category path, or null when the row is uncategorized or a transfer leg. */
  categoryName: string | null;
  payeeName: string | null;
  note: string;
  /** Signed decimal in the account's currency. Negative = expense. */
  amount: number;
  /** Direction as stated by the file. Carried explicitly because the sign of
   *  `amount` cannot recover it for zero-amount rows (`-0 === 0`). */
  type: TRANSACTION_TYPES;
  /** Money's check / reference number (`TRN.szId`), when present. */
  referenceNumber: string | null;
  /** True once the row was marked reconciled against a statement in Money. */
  reconciled: boolean;
  /** True when this is a transfer leg whose counterpart account is not being
   *  imported. Executed as `transfer_out_wallet`. */
  outOfWallet: boolean;
  /** True when this row came from a split — it is one line of a larger
   *  transaction. Informational for the preview. */
  fromSplit: boolean;
}

/**
 * A transfer between two imported accounts.
 *
 * Money records both legs and links them explicitly in its `TRN_XFER` table, so
 * pairing is exact — no amount/date heuristics are involved.
 */
export interface MsMoneyParseTransfer {
  /** Account the money leaves. */
  sourceAccountName: string;
  /** Account the money arrives in. */
  destinationAccountName: string;
  date: string;
  /** Positive decimal in `sourceCurrency`. */
  sourceAmount: number;
  /** Positive decimal in `destinationCurrency`. */
  destinationAmount: number;
  sourceCurrency: string;
  destinationCurrency: string;
  note: string;
  payeeName: string | null;
  /** Row indices of both legs, `[source, destination]`. */
  rowIndices: [number, number];
  /** Money's transaction ids for both legs. */
  sourceIds: [number, number];
}

/** Non-fatal parser observation surfaced in the preview step. */
export interface MsMoneyParseWarning {
  code:
    /** An account was skipped because its type is out of scope (investment/loan). */
    | 'account-type-unsupported'
    /** A row was skipped because Money marks it void. */
    | 'void-row-skipped'
    /** A row referenced an account that no longer exists in the file. */
    | 'orphan-row-skipped'
    /** A transfer leg's counterpart account is not being imported, so the leg
     *  imports as an out-of-wallet transaction instead. */
    | 'transfer-counterpart-not-imported'
    /** The file holds more rows than `MS_MONEY_MAX_ROWS`; the excess was dropped. */
    | 'row-limit-reached';
  message: string;
  /** How many rows/accounts this warning covers. Warnings are aggregated by
   *  code rather than emitted per row, so a file with 4,000 void rows produces
   *  one warning, not 4,000. */
  count: number;
}

/** What the parser found, for rendering the preview step. */
export interface MsMoneyParseResult {
  accounts: MsMoneyParseAccount[];
  categories: MsMoneyParseCategory[];
  payees: MsMoneyParsePayee[];
  transactions: MsMoneyParseTransaction[];
  transfers: MsMoneyParseTransfer[];
  warnings: MsMoneyParseWarning[];
  /** ISO instant range covering every parsed row, or null when nothing parsed. */
  dateRange: { from: string; to: string } | null;
  /** Money's base currency for the file, when it could be resolved. */
  baseCurrency: string | null;
  /** Which encryption variant the file used. Surfaced for support diagnostics. */
  encryption: 'new-sha1' | 'new-md5' | 'legacy-jet';
}

// ---------------------------------------------------------------------------
// Upload + parse
// ---------------------------------------------------------------------------

/**
 * Response to the binary upload. The file itself is not retained — only the
 * parse result, keyed by `uploadId` and scoped to the uploading user. Later
 * steps send that id, so a multi-megabyte database crosses the wire once.
 */
export interface MsMoneyUploadResponse {
  uploadId: string;
  result: MsMoneyParseResult;
  /** When the cached parse result expires (ISO instant). */
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// Account mapping (preview step → execute step decision)
// ---------------------------------------------------------------------------

/**
 * Per-account decision, discriminated on `action`:
 * - `create-new` — the import creates a fresh account. `currencyCode` comes
 *   from the file. `currentBalance` is the balance the account should show
 *   afterwards; null leaves it at the imported rows' net.
 * - `link-existing` — rows post to an existing account, whose pre-import
 *   balance is preserved. Only same-currency accounts are selectable.
 * - `skip` — the account and all its rows are left out of the import.
 */
export type MsMoneyAccountMappingValue =
  | { action: 'create-new'; currencyCode: string; currentBalance: number | null }
  | { action: 'link-existing'; accountId: string }
  | { action: 'skip' };

/** Keyed by `MsMoneyParseAccount.originalName`. */
export type MsMoneyAccountMapping = Record<string, MsMoneyAccountMappingValue>;

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

export interface DetectMsMoneyDuplicatesRequest {
  uploadId: string;
  accountMapping: MsMoneyAccountMapping;
}

/** Only meaningful for `link-existing` accounts — a fresh account has no prior
 *  transactions to match against. */
export interface DetectMsMoneyDuplicatesResponse {
  duplicates: DuplicateMatch[];
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

export interface ExecuteMsMoneyRequest extends ImportExecuteRequestBase {
  uploadId: string;
  accountMapping: MsMoneyAccountMapping;
  /** Keyed by `MsMoneyParseCategory.fullName`. Categories absent from this map
   *  import without a category rather than being silently created. */
  categoryMapping: CategoryMappingConfig;
  /** Row indices the user confirmed as duplicates and wants to skip. */
  skipDuplicateIndices: number[];
}

export interface ExecuteMsMoneyResponse {
  jobId: string;
}

// ---------------------------------------------------------------------------
// Job progress (SSE payload + GET /status response)
// ---------------------------------------------------------------------------

export const MS_MONEY_IMPORT_JOB_STATUSES = IMPORT_JOB_STATUSES;
export type MsMoneyImportJobStatus = ImportJobStatus;
export type MsMoneyImportErrorCode = ImportErrorCode;
export type MsMoneyImportError = ImportError;

/** Cumulative numbers reported once the worker finishes. */
export interface MsMoneyImportSummary extends ImportSummaryBase {
  accountsCreated: number;
  accountsLinked: number;
  accountsSkipped: number;
  categoriesCreated: number;
  payeesCreated: number;
  transactionsImported: number;
  transfersImported: number;
  /** Transfer legs whose counterpart account was not imported. */
  outOfWalletImported: number;
  duplicatesSkipped: number;
  errors: MsMoneyImportError[];
}

interface MsMoneyImportProgressBase {
  jobId: string;
  /** Rows committed so far. Each transaction and each transfer counts as 1. */
  processedCount: number;
  /** Expected total — transactions plus transfers. */
  totalCount: number;
}

/** SSE payload and GET /status response share this envelope. Discriminated over
 *  `status` so `summary` is guaranteed when completed and `error` when failed. */
export type MsMoneyImportProgress =
  | (MsMoneyImportProgressBase & { status: 'queued' | 'running' })
  | (MsMoneyImportProgressBase & { status: 'completed'; summary: MsMoneyImportSummary })
  | (MsMoneyImportProgressBase & { status: 'failed'; error: string });
