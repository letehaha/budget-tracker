import { logger } from '@js/utils/logger';
import PayeeAliases from '@models/payee-aliases.model';
import PayeeIgnoredNames from '@models/payee-ignored-names.model';
import Payees from '@models/payees.model';
import Transactions from '@models/transactions.model';
import { Op } from 'sequelize';

import { withTransaction } from '../common/with-transaction';
import { FUZZY_MATCH_THRESHOLD, buildHaystack, fuzzyFindBestMatch } from './fuzzy-matcher';
import { normalizePayeeName } from './normalize-name';

interface ExtractionInput {
  userId: number;
  rawMerchantName: string | null | undefined;
}

interface ExtractionResult {
  /** Final Payee id linked to the current transaction. Null when no rule matched. */
  payeeId: string | null;
}

const MERCHANT_KEYS = ['payee', 'merchant', 'merchantName', 'counterName'] as const;
/** Cap on the historical scan in Step 3 to keep the per-create-tx cost bounded. */
const STEP3_CANDIDATE_LIMIT = 2000;

/**
 * Pulls the historical raw merchant text from a Transactions row, falling
 * through the provider-specific JSONB keys in priority order, then `note`.
 * Mirrors the `coalesce(...)` in the PRD pseudocode.
 */
function extractRawFromTransaction({
  externalData,
  note,
}: {
  externalData: Record<string, unknown> | null | undefined;
  note: string | null | undefined;
}): string {
  if (externalData) {
    for (const key of MERCHANT_KEYS) {
      const value = externalData[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }
  }
  return note ?? '';
}

/** Step 1 — exact match against either `Payees.normalizedName` or `PayeeAliases.normalizedName`. */
async function findExactMatch({
  userId,
  normalizedQuery,
}: {
  userId: number;
  normalizedQuery: string;
}): Promise<string | null> {
  const directHit = await Payees.findOne({
    where: { userId, normalizedName: normalizedQuery },
    attributes: ['id'],
  });
  if (directHit) return directHit.id;

  const aliasHit = await PayeeAliases.findOne({
    where: { normalizedName: normalizedQuery },
    include: [
      {
        model: Payees,
        as: 'payee',
        required: true,
        where: { userId },
        attributes: ['id'],
      },
    ],
    attributes: ['id', 'payeeId'],
  });
  if (aliasHit) return aliasHit.payeeId;

  return null;
}

/**
 * Step 3 — count and collect prior unmatched transactions whose normalized
 * raw merchant equals `normalizedQuery`. Scoped to `payeeId IS NULL AND
 * payeeLocked = false`. Returns the ids so the caller can backfill them in
 * the same DB write.
 *
 * The set is bounded by `STEP3_CANDIDATE_LIMIT` so a one-time bulk import on
 * an unusually large account doesn't degrade per-row create cost. Anything
 * beyond the cap will be picked up by the post-sync note fuzzy backfill
 * (`note-fuzzy-backfill.ts`) or the future history-backfill tool on the
 * Transactions Optimizations page.
 */
async function collectPriorUnmatched({
  userId,
  normalizedQuery,
}: {
  userId: number;
  normalizedQuery: string;
}): Promise<string[]> {
  const candidates = await Transactions.findAll({
    where: {
      userId,
      payeeId: null,
      payeeLocked: false,
    },
    attributes: ['id', 'externalData', 'note'],
    limit: STEP3_CANDIDATE_LIMIT,
  });

  if (candidates.length === STEP3_CANDIDATE_LIMIT) {
    logger.info('[Payee extraction] Step 3 candidate scan hit cap; older unmatched transactions skipped', {
      userId,
      normalizedQuery,
      cap: STEP3_CANDIDATE_LIMIT,
    });
  }

  const matchedIds: string[] = [];
  for (const tx of candidates) {
    const raw = extractRawFromTransaction({
      externalData: tx.externalData as Record<string, unknown> | null,
      note: tx.note,
    });
    if (!raw) continue;
    if (normalizePayeeName({ raw }) === normalizedQuery) {
      matchedIds.push(tx.id);
    }
  }

  return matchedIds;
}

/**
 * Resolve a Payee for a raw provider merchant string. Pure resolver — does
 * not write the returned `payeeId` onto the caller's transaction; the caller
 * is expected to set it on the create payload. Aliases and any Step 3 Payee
 * promotion ARE written here (they need to land before the caller inserts
 * the current row).
 *
 * Step 0 (`payeeLocked` skip) is the caller's responsibility — pass `null`
 * for `rawMerchantName` or skip the call entirely when the row is locked.
 */
export const resolvePayeeForRawMerchant = withTransaction(
  async ({ userId, rawMerchantName }: ExtractionInput): Promise<ExtractionResult> => {
    const noMatch: ExtractionResult = { payeeId: null };

    if (!rawMerchantName) return noMatch;
    const trimmed = rawMerchantName.trim();
    if (!trimmed) return noMatch;

    const normalizedQuery = normalizePayeeName({ raw: trimmed });
    if (!normalizedQuery) return noMatch;

    // Step 1: exact match on canonical name or alias. Either way no alias
    // write is needed — canonical names are self-evident and alias hits
    // already have the row.
    const exactPayeeId = await findExactMatch({ userId, normalizedQuery });
    if (exactPayeeId) {
      return { payeeId: exactPayeeId };
    }

    // Step 2: fuzzy match across the user's full Payee + alias set.
    const userPayees = await Payees.findAll({
      where: { userId },
      include: [{ model: PayeeAliases, as: 'aliases' }],
    });

    if (userPayees.length > 0) {
      const haystack = buildHaystack({ payees: userPayees });
      const fuzzy = fuzzyFindBestMatch({ haystack, query: trimmed });

      if (fuzzy) {
        logger.info('[Payee extraction] fuzzy link', {
          userId,
          payeeId: fuzzy.payeeId,
          query: trimmed,
          score: fuzzy.score,
          threshold: FUZZY_MATCH_THRESHOLD,
          decision: 'link',
        });
        await ensureAliasExists({
          payeeId: fuzzy.payeeId,
          rawName: trimmed,
          normalizedName: normalizedQuery,
        });
        return { payeeId: fuzzy.payeeId };
      }

      logger.info('[Payee extraction] no fuzzy match', {
        userId,
        query: trimmed,
        threshold: FUZZY_MATCH_THRESHOLD,
        decision: 'reject',
      });
    }

    // Step 3: occurrence-based promotion. ≥ 1 prior unmatched + the current
    // tx = ≥ 2 occurrences → spin up a new Payee and backfill the priors.
    //
    // First check the user's ignored-names blocklist: this is the only path
    // that *creates* a new Payee from a raw string (Steps 1 + 2 only link to
    // existing user-curated Payees, and intentional aliases must keep
    // working). If this normalizedName is blocked, leave the tx unmatched
    // so the next sync doesn't re-promote it.
    const isIgnored = await PayeeIgnoredNames.findOne({
      where: { userId, normalizedName: normalizedQuery },
      attributes: ['id'],
    });
    if (isIgnored) {
      logger.info('[Payee extraction] suppressed by ignored-names blocklist', {
        userId,
        normalizedQuery,
      });
      return noMatch;
    }

    const priorIds = await collectPriorUnmatched({ userId, normalizedQuery });
    if (priorIds.length >= 1) {
      const created = await Payees.create({
        userId,
        name: trimmed,
        normalizedName: normalizedQuery,
        defaultCategoryId: null,
      });
      await PayeeAliases.create({
        payeeId: created.id,
        rawName: trimmed,
        normalizedName: normalizedQuery,
      });
      await Transactions.update({ payeeId: created.id }, { where: { id: { [Op.in]: priorIds }, userId } });
      logger.info('[Payee extraction] promoted from occurrences', {
        userId,
        payeeId: created.id,
        normalizedQuery,
        backfilledTxCount: priorIds.length,
      });
      return { payeeId: created.id };
    }

    // Step 4: leave unmatched.
    return noMatch;
  },
);

/**
 * Idempotent alias insert. `findOrCreate` collapses the check-then-create into
 * a single race-safe operation — UNIQUE (payeeId, normalizedName) plus
 * `findOrCreate` means a concurrent sync hitting the same merchant returns
 * the existing row instead of throwing.
 */
export async function ensureAliasExists({
  payeeId,
  rawName,
  normalizedName,
}: {
  payeeId: string;
  rawName: string;
  normalizedName: string;
}): Promise<void> {
  await PayeeAliases.findOrCreate({
    where: { payeeId, normalizedName },
    defaults: { payeeId, rawName, normalizedName },
  });
}
