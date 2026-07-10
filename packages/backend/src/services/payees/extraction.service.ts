import { logger } from '@js/utils/logger';
import PayeeAliases from '@models/payee-aliases.model';
import PayeeIgnoredNames from '@models/payee-ignored-names.model';
import Payees from '@models/payees.model';
import Transactions from '@models/transactions.model';
import { enqueueLogoResolutionAfterCommit } from '@services/brand-logos';
import { Op } from 'sequelize';

import { insertOrAdopt } from '../common/run-in-savepoint';
import { withTransaction } from '../common/with-transaction';
import { FUZZY_MATCH_THRESHOLD, buildHaystack, fuzzyFindBestMatch } from './fuzzy-matcher';
import { normalizePayeeName } from './normalize-name';
import { ensureAliasExists, resolveNormalizedName } from './payee-namespace';

interface ExtractionInput {
  userId: number;
  rawMerchantName: string | null | undefined;
}

interface ExtractionResult {
  /** Final Payee id linked to the current transaction. Null when no rule matched. */
  payeeId: string | null;
}

const MERCHANT_KEYS = ['payee', 'merchant', 'merchantName', 'counterName'] as const;
/** Per-call cap on the prior-unmatched scan; keeps per-create-tx cost bounded on large accounts. */
const PRIOR_UNMATCHED_SCAN_LIMIT = 2000;

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

/** Exact match against either `Payees.normalizedName` or `PayeeAliases.normalizedName`. */
async function findExactMatch({
  userId,
  normalizedQuery,
}: {
  userId: number;
  normalizedQuery: string;
}): Promise<string | null> {
  const hit = await resolveNormalizedName({ userId, normalized: normalizedQuery });
  return hit?.payeeId ?? null;
}

/**
 * Count and collect prior unmatched transactions whose normalized raw
 * merchant equals `normalizedQuery`. Scoped to `payeeId IS NULL AND
 * payeeLocked = false`. Returns the ids so the caller can backfill them in
 * the same DB write.
 *
 * The set is bounded by `PRIOR_UNMATCHED_SCAN_LIMIT` so a one-time bulk
 * import on an unusually large account doesn't degrade per-row create cost.
 * Anything beyond the cap will be picked up by the post-sync note fuzzy
 * backfill (`note-fuzzy-backfill.ts`) or the future history-backfill tool on
 * the Transactions Optimizations page.
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
    limit: PRIOR_UNMATCHED_SCAN_LIMIT,
  });

  if (candidates.length === PRIOR_UNMATCHED_SCAN_LIMIT) {
    logger.info('[Payee extraction] prior-unmatched scan hit cap; older transactions skipped', {
      userId,
      normalizedQuery,
      cap: PRIOR_UNMATCHED_SCAN_LIMIT,
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
 * Resolve a Payee for a raw provider merchant string. Pure resolver – does
 * not write the returned `payeeId` onto the caller's transaction; the caller
 * is expected to set it on the create payload. Aliases and any newly
 * promoted Payee ARE written here (they need to land before the caller
 * inserts the current row).
 *
 * Skipping `payeeLocked` rows is the caller's responsibility – pass `null`
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
    // write is needed – canonical names are self-evident and alias hits
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
      // Concurrent bank-sync workers can promote the same `normalizedName` at
      // once and race on `payees_user_id_normalized_name_uniq`; `insertOrAdopt`
      // keeps the shared transaction usable and lands both racers on one Payee.
      const payee = await insertOrAdopt({
        insert: () =>
          Payees.create({
            userId,
            name: trimmed,
            normalizedName: normalizedQuery,
            defaultCategoryId: null,
          }),
        adopt: () => Payees.findOne({ where: { userId, normalizedName: normalizedQuery } }),
      });
      // `ensureAliasExists` is savepoint-isolated too, absorbing the same race.
      await ensureAliasExists({
        payeeId: payee.id,
        rawName: trimmed,
        normalizedName: normalizedQuery,
      });
      await Transactions.update({ payeeId: payee.id }, { where: { id: { [Op.in]: priorIds }, userId } });
      logger.info('[Payee extraction] promoted from occurrences', {
        userId,
        payeeId: payee.id,
        normalizedQuery,
        backfilledTxCount: priorIds.length,
      });
      // This promotion always runs inside the sync/create-transaction
      // transaction (this resolver is `withTransaction`-wrapped and its callers
      // are too), so the helper defers the enqueue to `afterCommit` – the
      // worker only sees the Payee once the row is committed and visible.
      enqueueLogoResolutionAfterCommit({ entity: 'payee', id: payee.id });
      return { payeeId: payee.id };
    }

    // Step 4: leave unmatched.
    return noMatch;
  },
);
