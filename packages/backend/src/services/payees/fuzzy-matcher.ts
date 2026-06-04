import type Payees from '@models/payees.model';
import Fuse, { type IFuseOptions } from 'fuse.js';

import { normalizePayeeName } from './normalize-name';

interface HaystackEntry {
  payeeId: string;
  text: string;
}

/**
 * Build the Fuse haystack for one user: every Payee's canonical name AND every
 * alias points back to the same `payeeId` — collisions are fine because the
 * top-scoring entry wins.
 */
export function buildHaystack({ payees }: { payees: Payees[] }): HaystackEntry[] {
  const haystack: HaystackEntry[] = [];
  for (const payee of payees) {
    haystack.push({ payeeId: payee.id, text: payee.name });
    if (payee.aliases) {
      for (const alias of payee.aliases) {
        haystack.push({ payeeId: payee.id, text: alias.rawName });
      }
    }
  }
  return haystack;
}

export const FUZZY_MATCH_THRESHOLD = 0.4;
const MIN_MATCH_CHAR_LENGTH = 3;

/**
 * Fuse.js configuration for Payee name + alias matching.
 *
 * `ignoreLocation` is critical: provider strings frequently embed merchant
 * names mid-string (e.g. `POS PURCHASE AMAZON.COM*A4B2 0815`), and the
 * default position-sensitive scoring would reject those.
 *
 * Threshold 0.4 mirrors the value used by `tag-auto-matching` per the PRD.
 * Tune empirically once real-world telemetry is available.
 */
const FUSE_OPTIONS: IFuseOptions<HaystackEntry> = {
  keys: ['text'],
  threshold: FUZZY_MATCH_THRESHOLD,
  includeScore: true,
  isCaseSensitive: false,
  ignoreLocation: true,
  minMatchCharLength: MIN_MATCH_CHAR_LENGTH,
};

interface FuzzyMatchResult {
  payeeId: string;
  score: number;
}

/**
 * Build a Fuse index once, then call `search` many times against it. Type B
 * batch matching reuses the same index across an entire freshly-synced batch
 * to avoid rebuilding per transaction.
 */
export function buildFuzzyIndex({ haystack }: { haystack: HaystackEntry[] }) {
  const fuse = new Fuse(haystack, FUSE_OPTIONS);
  return {
    search({ query }: { query: string }): FuzzyMatchResult | null {
      const normalized = normalizePayeeName({ raw: query });
      if (normalized.length < MIN_MATCH_CHAR_LENGTH) return null;
      const results = fuse.search(normalized);
      const best = results[0];
      if (!best || best.score === undefined || best.score > FUZZY_MATCH_THRESHOLD) {
        return null;
      }
      return { payeeId: best.item.payeeId, score: best.score };
    },
  };
}

/**
 * Convenience wrapper for the one-off path (single query, no batching).
 * Internally builds a fresh index.
 */
export function fuzzyFindBestMatch({
  haystack,
  query,
}: {
  haystack: HaystackEntry[];
  query: string;
}): FuzzyMatchResult | null {
  return buildFuzzyIndex({ haystack }).search({ query });
}
