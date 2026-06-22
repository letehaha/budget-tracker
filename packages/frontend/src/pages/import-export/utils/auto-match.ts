/**
 * Pure, dependency-free utilities for automatic CSV column matching.
 *
 * Covers four behaviours:
 *   - Header normalisation & tiered synonym scoring
 *   - Greedy field assignment by priority order
 *   - Per-value entity linking (name + optional currency)
 *   - Transaction-type value classification (income / expense / unknown)
 */

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Lowercases a header string and strips every non-alphanumeric character so
 * that separators (spaces, underscores, hyphens, dots) are ignored during
 * comparison.
 *
 * Examples:
 *   "Tx Date"   → "txdate"
 *   "tx_date"   → "txdate"
 *   "tx-date"   → "txdate"
 *   "TxDate"    → "txdate"
 */
export function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ---------------------------------------------------------------------------
// Synonym dictionaries (priority order — most-likely first)
// ---------------------------------------------------------------------------

/** Maps each matchable system field to its ordered synonym list. */
export const COLUMN_SYNONYMS = {
  date: [
    'date',
    'transaction_date',
    'txn_date',
    'posted_date',
    'posting_date',
    'value_date',
    'booking_date',
    'operation_date',
    'op_date',
    'datetime',
    'timestamp',
    'time',
    'dt',
  ],
  amount: [
    'amount',
    'transaction_amount',
    'value',
    'sum',
    'total',
    'montant',
    'importe',
    'money',
    'gross_amount',
    'amt',
  ],
  description: [
    'description',
    'desc',
    'note',
    'notes',
    'memo',
    'details',
    'narrative',
    'narration',
    'concept',
    'detalle',
    'comment',
    'reference',
  ],
  category: ['category', 'categoria', 'categoría', 'cat', 'classification', 'group'],
  account: ['account', 'account_name', 'acct', 'wallet', 'source_account', 'from_account', 'bank'],
  currency: ['currency', 'currency_code', 'ccy', 'cur', 'iso_currency', 'moneda', 'waluta'],
  payee: ['payee', 'merchant', 'beneficiary', 'vendor', 'counterparty', 'recipient', 'beneficiario'],
  tags: ['tags', 'tag', 'labels', 'label', 'etiqueta'],
  transactionType: [
    'type',
    'transaction_type',
    'tx_type',
    'direction',
    'debit_credit',
    'dc',
    'kind',
    'movement',
    'operation_type',
    'tipo',
  ],
} as const satisfies Record<string, readonly string[]>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The 9 system fields that participate in automatic column matching. */
export type MatchableField = keyof typeof COLUMN_SYNONYMS;

/**
 * How confidently a CSV header was matched to a synonym.
 *
 * - `exact`       — normalised header equals normalised synonym
 * - `starts-with` — normalised header starts with normalised synonym (or vice-versa)
 * - `contains`    — normalised header contains normalised synonym (or vice-versa)
 */
export type MatchConfidence = 'exact' | 'starts-with' | 'contains';

/** A CSV column assigned to a system field, with the tier that produced the match. */
export type ColumnMatch = { column: string; confidence: MatchConfidence } | null;

/** One `ColumnMatch` (or null) for each of the 9 matchable fields. */
export type ColumnMatchResult = Record<MatchableField, ColumnMatch>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Tier rank — lower number = better. */
const CONFIDENCE_RANK: Record<MatchConfidence, number> = {
  exact: 0,
  'starts-with': 1,
  contains: 2,
};

/**
 * Greedy field priority order.
 * A header claimed by an earlier field in this list is not available to later
 * fields at any confidence tier.
 */
const FIELD_PRIORITY: readonly MatchableField[] = [
  'date',
  'amount',
  'currency',
  'account',
  'category',
  'transactionType',
  'payee',
  'tags',
  'description',
];

interface CandidateScore {
  column: string;
  confidence: MatchConfidence;
  /** Index into the field's synonym list — lower = higher synonym priority. */
  synonymIndex: number;
}

/**
 * Scores a single normalised header against a field's synonym list and returns
 * the best-tier match (with synonym priority as tiebreaker within the tier).
 * Returns `null` when no synonym matches at any tier.
 */
function scoreHeader({ normalizedHeader, synonyms }: { normalizedHeader: string; synonyms: readonly string[] }): {
  confidence: MatchConfidence;
  synonymIndex: number;
} | null {
  let best: { confidence: MatchConfidence; synonymIndex: number } | null = null;

  for (const [i, rawSyn] of synonyms.entries()) {
    const syn = normalizeHeader(rawSyn);

    let confidence: MatchConfidence | null = null;

    if (normalizedHeader === syn) {
      confidence = 'exact';
    } else if (normalizedHeader.startsWith(syn)) {
      // starts-with: header begins with the full synonym (syn is a prefix of header).
      // Reverse direction (syn starts with header) would mean header is a prefix of syn,
      // which is a `contains` relationship — handled below.
      confidence = 'starts-with';
    } else if (normalizedHeader.includes(syn)) {
      // contains: synonym appears as a substring inside the header (at a non-zero offset,
      // since equal case is already handled by exact and starts-with respectively).
      confidence = 'contains';
    }

    if (confidence === null) continue;

    if (
      best === null ||
      CONFIDENCE_RANK[confidence] < CONFIDENCE_RANK[best.confidence] ||
      (CONFIDENCE_RANK[confidence] === CONFIDENCE_RANK[best.confidence] && i < best.synonymIndex)
    ) {
      best = { confidence, synonymIndex: i };
    }

    // Can't beat exact at synonym index 0 — short-circuit
    if (best.confidence === 'exact' && best.synonymIndex === 0) break;
  }

  return best;
}

// ---------------------------------------------------------------------------
// Main matcher
// ---------------------------------------------------------------------------

/**
 * Matches CSV headers to system fields using tiered synonym scoring and greedy
 * assignment by field priority order.
 *
 * Scoring tiers (best → worst): exact → starts-with → contains. Within a tier,
 * earlier synonyms outrank later ones. A header is assigned to the highest-priority
 * field that can claim it; once claimed it is unavailable to lower-priority fields.
 *
 * Fields that receive no header match return `null`.
 */
export function matchColumns({ headers }: { headers: string[] }): ColumnMatchResult {
  // Pre-normalise headers once
  const normalizedHeaders = headers.map(normalizeHeader);

  // Build candidate map: field → best scoring candidate across all headers
  const candidates = new Map<MatchableField, CandidateScore>();

  for (const field of FIELD_PRIORITY) {
    const synonyms = COLUMN_SYNONYMS[field];
    let bestForField: CandidateScore | null = null;

    for (let hi = 0; hi < normalizedHeaders.length; hi++) {
      const nh = normalizedHeaders[hi];
      const col = headers[hi];
      if (nh === undefined || col === undefined) continue;

      const scored = scoreHeader({ normalizedHeader: nh, synonyms });
      if (scored === null) continue;

      if (
        bestForField === null ||
        CONFIDENCE_RANK[scored.confidence] < CONFIDENCE_RANK[bestForField.confidence] ||
        (CONFIDENCE_RANK[scored.confidence] === CONFIDENCE_RANK[bestForField.confidence] &&
          scored.synonymIndex < bestForField.synonymIndex)
      ) {
        bestForField = { column: col, confidence: scored.confidence, synonymIndex: scored.synonymIndex };
      }
    }

    if (bestForField !== null) {
      candidates.set(field, bestForField);
    }
  }

  // Greedy assignment: walk fields in priority order; once a header is taken,
  // remove it from consideration for lower-priority fields.
  const taken = new Set<string>(); // original (non-normalised) column values
  const result = {} as ColumnMatchResult;

  for (const field of FIELD_PRIORITY) {
    const candidate = candidates.get(field);
    if (candidate && !taken.has(candidate.column)) {
      result[field] = { column: candidate.column, confidence: candidate.confidence };
      taken.add(candidate.column);
    } else {
      result[field] = null;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Per-value entity linking
// ---------------------------------------------------------------------------

/**
 * Maps each source name to a matching target entity id, or `null` when no
 * entity matches.
 *
 * Matching rules:
 * 1. Normalised names must be equal (case- and separator-insensitive).
 * 2. When BOTH the source and the target carry a `currencyCode`, the codes
 *    must also match (case-insensitive). This enforces the currency-aware
 *    account-linking rule: same name but different currencies are not the same account.
 *
 * Returns a `Map<sourceName, targetId | null>` keyed by the original (un-normalised)
 * source name strings.
 */
export function matchValuesByName<T extends { id: string | number; name: string; currencyCode?: string }>({
  sources,
  targets,
}: {
  sources: { name: string; currencyCode?: string }[];
  targets: T[];
}): Map<string, T['id'] | null> {
  const result = new Map<string, T['id'] | null>();

  for (const source of sources) {
    const normalizedSource = normalizeHeader(source.name);
    let matched: T | undefined;

    for (const target of targets) {
      if (normalizeHeader(target.name) !== normalizedSource) continue;

      // Currency-aware check: only enforce when both sides carry a currency code
      if (source.currencyCode !== undefined && target.currencyCode !== undefined) {
        if (source.currencyCode.toLowerCase() !== target.currencyCode.toLowerCase()) continue;
      }

      matched = target;
      break;
    }

    result.set(source.name, matched !== undefined ? matched.id : null);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Transaction-type value classification
// ---------------------------------------------------------------------------

/**
 * Raw CSV values that map to the "income" transaction type.
 * Ordered by likelihood; normalised before comparison.
 */
export const INCOME_VALUE_SYNONYMS: readonly string[] = ['credit', 'deposit', 'in', 'income', 'ingreso'];

/**
 * Raw CSV values that map to the "expense" transaction type.
 * Ordered by likelihood; normalised before comparison.
 */
export const EXPENSE_VALUE_SYNONYMS: readonly string[] = ['debit', 'withdrawal', 'out', 'expense', 'gasto'];

const NORMALIZED_INCOME_SYNONYMS = INCOME_VALUE_SYNONYMS.map(normalizeHeader);
const NORMALIZED_EXPENSE_SYNONYMS = EXPENSE_VALUE_SYNONYMS.map(normalizeHeader);

/**
 * Buckets each distinct raw value from a CSV transaction-type column into
 * income / expense / unknown based on synonym membership.
 *
 * Matching is exact-normalised (lowercase, non-alphanumeric stripped). Values
 * that match neither income nor expense synonyms land in `unknown`.
 *
 * Used to pre-fill the Income values / Expense values inputs in the transaction-type expansion row.
 */
export function classifyTransactionTypeValues({ distinctValues }: { distinctValues: string[] }): {
  income: string[];
  expense: string[];
  unknown: string[];
} {
  const income: string[] = [];
  const expense: string[] = [];
  const unknown: string[] = [];

  for (const raw of distinctValues) {
    const normalized = normalizeHeader(raw);

    if (NORMALIZED_INCOME_SYNONYMS.includes(normalized)) {
      income.push(raw);
    } else if (NORMALIZED_EXPENSE_SYNONYMS.includes(normalized)) {
      expense.push(raw);
    } else {
      unknown.push(raw);
    }
  }

  return { income, expense, unknown };
}
