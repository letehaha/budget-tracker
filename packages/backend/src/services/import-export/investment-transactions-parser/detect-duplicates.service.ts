/**
 * Possible-duplicate detection for investment transactions.
 *
 * Run server-side at extract time *only for already-resolved securities* —
 * unresolved holdings can't be looked up yet. For each (portfolio, security,
 * date, side) tuple, find existing transactions whose quantity is within a
 * tight tolerance and surface them so the review UI can flag the row.
 *
 * Why per-row tolerance instead of exact: exchange CSVs round quantities at
 * arbitrary precision (Binance: 0.001 ETH vs 0.00100000 ETH for the same
 * trade). Exact-match would miss those.
 */
import InvestmentTransaction from '@models/investments/investment-transaction.model';
import Portfolios from '@models/investments/portfolios.model';
import { Big } from 'big.js';

/** ±0.01% — tight enough to avoid false positives on day-trading, loose enough
 * to absorb formatting differences between two exports of the same trade. */
export const DUPLICATE_QUANTITY_TOLERANCE = 0.0001;

/** Stringify the dedup-group key tuple. Hoisted out of the function body to
 * satisfy `consistent-function-scoping` — it doesn't close over anything. */
function groupKey(r: { portfolioId: string; securityId: string; date: string }): string {
  return `${r.portfolioId}|${r.securityId}|${r.date}`;
}

interface DuplicateCandidate {
  /** Identifies the parsed transaction we matched against an existing one. */
  tempId: string;
  /** id of the existing InvestmentTransaction we believe this duplicates. */
  existingTransactionId: string;
}

interface ParsedRowForDedup {
  tempId: string;
  portfolioId: string;
  securityId: string;
  date: string;
  side: 'buy' | 'sell';
  quantity: string;
}

/**
 * Quantity-comparison helper. Exported for unit testing — the tolerance math
 * is the only non-trivial logic here.
 */
export function quantitiesMatch({ a, b, tolerance }: { a: string; b: string; tolerance: number }): boolean {
  const left = new Big(a);
  const right = new Big(b);
  if (left.eq(0) && right.eq(0)) return true;
  if (left.eq(0) || right.eq(0)) return false;
  const diff = left.minus(right).abs();
  const denominator = left.abs();
  return diff.div(denominator).toNumber() <= tolerance;
}

/**
 * Find possible duplicates for a batch of parsed rows. Returns one entry per
 * matched row — at most one duplicate per row (the first existing match,
 * earliest by id). Multiple matches per row are noise the UI doesn't need.
 */
export async function detectInvestmentDuplicates({
  userId,
  rows,
}: {
  userId: number;
  rows: ParsedRowForDedup[];
}): Promise<DuplicateCandidate[]> {
  if (rows.length === 0) return [];

  // Group rows by (portfolioId, securityId, date) so we can hit the DB once
  // per group rather than once per row.
  const groups = new Map<string, ParsedRowForDedup[]>();
  for (const row of rows) {
    const key = groupKey(row);
    const existing = groups.get(key);
    if (existing) existing.push(row);
    else groups.set(key, [row]);
  }

  const candidates: DuplicateCandidate[] = [];

  for (const [, groupRows] of groups) {
    const sample = groupRows[0]!;
    const existingTxs = await InvestmentTransaction.findAll({
      where: {
        portfolioId: sample.portfolioId,
        securityId: sample.securityId,
        date: sample.date,
      },
      include: [
        {
          model: Portfolios,
          as: 'portfolio',
          attributes: [],
          where: { userId },
          required: true,
        },
      ],
      attributes: ['id', 'transactionType', 'quantity'],
    });

    if (existingTxs.length === 0) continue;

    for (const row of groupRows) {
      const match = existingTxs.find((existing) => {
        const existingSide = existing.transactionType === 'expense' ? 'buy' : 'sell';
        if (existingSide !== row.side) return false;
        return quantitiesMatch({
          a: existing.quantity.toDecimalString(10),
          b: row.quantity,
          tolerance: DUPLICATE_QUANTITY_TOLERANCE,
        });
      });

      if (match) {
        candidates.push({ tempId: row.tempId, existingTransactionId: match.id });
      }
    }
  }

  return candidates;
}
