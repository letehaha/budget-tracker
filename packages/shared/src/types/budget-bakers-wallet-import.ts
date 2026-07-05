/**
 * Shared contracts for the Wallet (BudgetBakers) CSV import pipeline. Lives in
 * the shared package so backend (parser, queue, controllers) and frontend
 * (wizard UI, Pinia store, API client) stay in sync.
 *
 * Monetary values cross the wire as decimals (e.g. 12.34) — the convention
 * for HTTP boundaries in this codebase. Internal Money arithmetic happens
 * on each side independently.
 */

import { TRANSACTION_TYPES } from './enums';
import { IMPORT_JOB_STATUSES } from './import-export';
import type { CategoryMappingConfig, DuplicateMatch, ImportJobStatus } from './import-export';

/** Hard cap on rows the parser will accept. Mirrors the YNAB importer limit so
 *  a single rogue upload can't OOM the parse step. */
export const BUDGET_BAKERS_WALLET_MAX_ROWS = 100_000;

/** The category string Wallet injects on every transfer leg. It is a marker,
 *  not a real category — the parser uses it to identify transfer rows and must
 *  never create a category with this name. */
export const BUDGET_BAKERS_WALLET_TRANSFER_CATEGORY = 'Transfer, withdraw';

/** Wallet CSV files use semicolon as the field delimiter (not comma). Quoted
 *  fields may still contain semicolons and commas — the CSV parser handles
 *  escaping; this constant drives the `delimiter` option. */
export const BUDGET_BAKERS_WALLET_CSV_DELIMITER = ';';

// ---------------------------------------------------------------------------
// Parse-result types (what the parser returns and the preview step renders)
// ---------------------------------------------------------------------------

/** Distinct account discovered in the CSV, ready for the preview step.
 *  Each `account` column value maps to exactly one currency in a Wallet
 *  export (the app enforces single-currency accounts). */
export interface BudgetBakersWalletParseAccount {
  /** Verbatim `account` column value — the join key in the mapping payload. */
  originalName: string;
  /** Three-letter ISO code detected from this account's rows. Wallet
   *  guarantees a single currency per account, so the first row wins. */
  currency: string;
  /** Total rows (including transfer legs) belonging to this account.
   *  Informational — drives the count badge in preview. */
  transactionCount: number;
  /** Signed sum of all this account's `amount` values (expenses negative,
   *  income positive). Purely informational for the preview step — the
   *  execute step derives real balances from the imported transactions. */
  netImportedAmount: number;
}

/** Distinct non-transfer category found across all rows. The transfer-marker
 *  category (`BUDGET_BAKERS_WALLET_TRANSFER_CATEGORY`) is excluded — it is never created. */
export interface BudgetBakersWalletParseCategory {
  name: string;
  transactionCount: number;
}

/** Distinct label value found across all rows. Wallet's `labels` column joins
 *  multiple labels on one row with `, ` (e.g. `Maru, Ahorro`), so a single row
 *  can contribute several of these. Each distinct value becomes a tag on execute. */
export interface BudgetBakersWalletParseTag {
  name: string;
  transactionCount: number;
}

/** A single ordinary (non-transfer) transaction row, or an unpaired transfer
 *  leg imported as an out-of-wallet transaction.
 *
 *  `amount` is a signed decimal: negative for expenses, positive for income.
 *  The CSV `amount` column is always positive — the parser applies the sign
 *  from `type` (Expense → negative, Income → positive). `ref_currency_amount`
 *  from the CSV is not carried here; the execute step lets the app recompute
 *  `refAmount` via FX-by-date, matching the YNAB importer's approach. */
export interface BudgetBakersWalletParseTransaction {
  rowIndex: number;
  /** ISO instant (e.g. `2025-12-25T11:00:00.000Z`). The CSV's `date` column
   *  is normalized from either ISO-8601 or `DD/MM/YYYY HH:MM` to a UTC
   *  instant string by the parser. */
  date: string;
  accountName: string;
  /** Null for out-of-wallet legs (unpaired transfer rows). Ordinary rows carry
   *  the raw `category` column value, or null when the cell is empty. */
  categoryName: string | null;
  /** Verbatim `payee` column value (a merchant/counterparty name), or null when
   *  the cell is empty. The execute step resolves this to a Payee and links it
   *  to the imported transaction. Paired transfer legs carry no payee — see
   *  `BudgetBakersWalletParseTransfer`. */
  payeeName: string | null;
  note: string;
  /** Signed decimal in the account's currency. Negative = expense. */
  amount: number;
  /** Income vs expense as stated by the CSV `type` column. Carried explicitly
   *  because the sign of `amount` cannot recover it for zero-amount rows
   *  (`-0 === 0`), and it drives the imported transaction's direction. */
  type: TRANSACTION_TYPES;
  /** Raw value from the `payment_type` column (`Cash`, `Credit card`, or
   *  `Transfer`). The execute step maps this to the app's PAYMENT_TYPES
   *  enum; passing it raw keeps the parser free of enum dependencies. */
  paymentType: string;
  /** Distinct label names parsed from the row's `labels` cell (comma-separated
   *  in the export, e.g. `Maru, Ahorro` → `['Maru', 'Ahorro']`). Empty when the
   *  cell is blank. Each becomes a tag attached to the transaction on execute. */
  tags: string[];
  /** True when this row is an unpaired transfer leg (no matching counterpart
   *  was found during pairing). The execute step imports these as
   *  `transfer_out_wallet` transactions rather than ordinary income/expense. */
  outOfWallet: boolean;
}

/** A matched pair of transfer legs (one Expense row + one Income row) that
 *  will be imported as a single `common_transfer` between two app accounts.
 *
 *  Unlike the YNAB importer, Wallet exports include both legs with their own
 *  amounts — so cross-currency transfers carry distinct `sourceAmount` and
 *  `destinationAmount`. Both are positive decimals; the execute step applies
 *  the correct sign when creating each leg's transaction. */
export interface BudgetBakersWalletParseTransfer {
  /** Account where money leaves (the Expense leg). */
  sourceAccountName: string;
  /** Account where money arrives (the Income leg). */
  destinationAccountName: string;
  /** ISO instant shared by both legs. Wallet guarantees paired legs have
   *  identical timestamps. */
  date: string;
  /** Positive decimal in `sourceCurrency`. */
  sourceAmount: number;
  /** Positive decimal in `destinationCurrency`. */
  destinationAmount: number;
  sourceCurrency: string;
  destinationCurrency: string;
  note: string;
  /** Original CSV row indices in order `[expenseRowIndex, incomeRowIndex]`. */
  rowIndices: [number, number];
}

/** Non-fatal parser observation surfaced to the user in the preview step. */
export interface BudgetBakersWalletParseWarning {
  rowIndex: number;
  code:
    | 'unparseable-amount'
    | 'unparseable-date'
    | 'row-skipped'
    /** Emitted for each transfer leg that had no matching counterpart. The leg
     *  is still imported as an out-of-wallet transaction — this is informational. */
    | 'transfer-counterpart-missing';
  message: string;
}

/** Snapshot of what the parser found, for rendering the preview step. It is a
 *  UI-only view: the detect-duplicates and execute requests carry the raw
 *  `fileContent`, and the server re-parses it on each call. The parser is pure
 *  and stateless, so re-parsing yields the same result without round-tripping
 *  this object back over the wire. */
export interface BudgetBakersWalletParseResult {
  accounts: BudgetBakersWalletParseAccount[];
  categories: BudgetBakersWalletParseCategory[];
  tags: BudgetBakersWalletParseTag[];
  transactions: BudgetBakersWalletParseTransaction[];
  transfers: BudgetBakersWalletParseTransfer[];
  warnings: BudgetBakersWalletParseWarning[];
  /** ISO instant range covering every parsed row, or null for an empty file. */
  dateRange: { from: string; to: string } | null;
  /** ISO currency code of the account(s) whose `amount == ref_currency_amount`,
   *  i.e. the export's reference currency. Shown in the preview as a note —
   *  the execute step does not use it (refAmount is recomputed by the app). */
  detectedBaseCurrency: string | null;
}

// ---------------------------------------------------------------------------
// HTTP request / response shapes
// ---------------------------------------------------------------------------

export interface ParseBudgetBakersWalletRequest {
  fileContent: string;
}

export interface ParseBudgetBakersWalletResponse {
  result: BudgetBakersWalletParseResult;
}

// ---------------------------------------------------------------------------
// Account mapping (preview step → execute step decision)
// ---------------------------------------------------------------------------

/** Per-account decision the user makes in the preview step.
 *
 *  Discriminated on `action`:
 *  - `create-new` — the import creates a fresh account. `currencyCode` is
 *    required (auto-filled from the detected currency). `currentBalance` is
 *    the balance the user wants the account to show after import; null means
 *    "leave it at whatever the imported transactions sum to".
 *  - `link-existing` — transactions are posted to an already-existing app
 *    account. Its pre-import balance is preserved by the execute step
 *    (captured before importing, restored via `updateAccount` afterwards).
 *    Only accounts with the same currency as the CSV account are selectable
 *    in the UI.
 */
export type BudgetBakersWalletAccountMappingValue =
  | { action: 'create-new'; currencyCode: string; currentBalance: number | null }
  | { action: 'link-existing'; accountId: string };

/** Keyed by `BudgetBakersWalletParseAccount.originalName`. */
export type BudgetBakersWalletAccountMapping = Record<string, BudgetBakersWalletAccountMappingValue>;

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

export interface DetectBudgetBakersWalletDuplicatesRequest {
  fileContent: string;
  accountMapping: BudgetBakersWalletAccountMapping;
}

/** Duplicate detection is only meaningful for `link-existing` accounts —
 *  new accounts have no prior transactions to match against. `DuplicateMatch`
 *  is reused from the generic CSV importer so the frontend can render the
 *  same `DuplicatesTable` component without conversion. */
export interface DetectBudgetBakersWalletDuplicatesResponse {
  duplicates: DuplicateMatch[];
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

export interface ExecuteBudgetBakersWalletRequest {
  fileContent: string;
  accountMapping: BudgetBakersWalletAccountMapping;
  /** Per-category decision keyed by the verbatim Wallet `category` value
   *  (matching `BudgetBakersWalletParseCategory.name`). Each distinct non-transfer category
   *  is mapped to an existing category (`link-existing`) or created fresh
   *  (`create-new`). The transfer-marker category (`BUDGET_BAKERS_WALLET_TRANSFER_CATEGORY`)
   *  is never present here — transfers carry no category. Rows whose category is
   *  absent from this map import without a category. */
  categoryMapping: CategoryMappingConfig;
  /** Row indices the user confirmed as duplicates and wants to skip. The
   *  execute step builds a Set from this and skips matching rows when
   *  creating transactions. Default UI behaviour: skip all detected
   *  duplicates; user may un-mark individual rows to import them anyway. */
  skipDuplicateIndices: number[];
}

export interface ExecuteBudgetBakersWalletResponse {
  jobId: string;
}

// ---------------------------------------------------------------------------
// Job progress (SSE payload + GET /status response)
// ---------------------------------------------------------------------------

/** BudgetBakers Wallet import jobs use the shared import-job lifecycle. Re-exported under the
 *  Wallet-specific names so existing consumers keep working. */
export const BUDGET_BAKERS_WALLET_IMPORT_JOB_STATUSES = IMPORT_JOB_STATUSES;
export type BudgetBakersWalletImportJobStatus = ImportJobStatus;

/** Machine-recognizable BudgetBakers Wallet import failure codes the UI special-cases.
 *  `account-balance-desync`: a linked account's pre-import balance could not be
 *  restored after the rows landed, so its balance may now be wrong. */
export type BudgetBakersWalletImportErrorCode = 'account-balance-desync';

/** Cumulative numbers reported once the worker finishes. */
export interface BudgetBakersWalletImportSummary {
  accountsCreated: number;
  accountsLinked: number;
  categoriesCreated: number;
  payeesCreated: number;
  tagsCreated: number;
  transactionsImported: number;
  transfersImported: number;
  /** Unpaired transfer legs imported as `transfer_out_wallet` transactions. */
  outOfWalletImported: number;
  duplicatesSkipped: number;
  /** `rowIndex` is the human-visible CSV line for a per-row failure, or `null`
   *  for an account-level failure that maps to no single row (e.g. a balance
   *  restore that did not apply). `code` tags machine-recognizable failures so
   *  the UI can exhaustively special-case them. */
  errors: { rowIndex: number | null; error: string; code?: BudgetBakersWalletImportErrorCode }[];
}

/** Common counters every progress event carries. */
interface BudgetBakersWalletImportProgressBase {
  jobId: string;
  /** Rows committed so far. Each transaction and each transfer counts as 1. */
  processedCount: number;
  /** Expected total — sum of transactions + transfers. */
  totalCount: number;
}

/** SSE payload and GET /status response share the same envelope. Discriminated
 *  over `status` so `summary` is guaranteed when completed and `error` is
 *  guaranteed when failed — callers narrow once and read straight through. */
export type BudgetBakersWalletImportProgress =
  | (BudgetBakersWalletImportProgressBase & { status: 'queued' | 'running' })
  | (BudgetBakersWalletImportProgressBase & { status: 'completed'; summary: BudgetBakersWalletImportSummary })
  | (BudgetBakersWalletImportProgressBase & { status: 'failed'; error: string });
