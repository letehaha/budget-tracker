import { logger } from '@js/utils/logger';
import PayeeAliases from '@models/payee-aliases.model';
import Payees from '@models/payees.model';
import Transactions from '@models/transactions.model';
import { Op } from 'sequelize';

import { withTransaction } from '../common/with-transaction';
import { applyPayeeCategorization } from './apply-categorization';
import { ensureAliasExists } from './extraction.service';
import { buildFuzzyIndex, buildHaystack } from './fuzzy-matcher';
import { normalizePayeeName } from './normalize-name';

interface TypeBInput {
  userId: number;
  transactionIds: string[];
}

interface TypeBResult {
  scanned: number;
  linked: number;
}

/**
 * Type B fuzzy pass — note-based secondary extraction.
 *
 * For each freshly-synced transaction where `payeeId IS NULL` AND
 * `payeeLocked = false`, build a single Fuse index over the user's Payees +
 * aliases and search using the transaction's `note`. On match: link to that
 * Payee and add the note as an alias so future syncs hit Step 1 exact match.
 *
 * Type B does NOT do occurrence-based promotion — the signal is weaker than
 * a provider-supplied merchant name, so we never spin up new Payees here.
 */
export const runTypeBFuzzyPass = withTransaction(
  async ({ userId, transactionIds }: TypeBInput): Promise<TypeBResult> => {
    if (transactionIds.length === 0) return { scanned: 0, linked: 0 };

    const userPayees = await Payees.findAll({
      where: { userId },
      include: [{ model: PayeeAliases, as: 'aliases' }],
    });
    if (userPayees.length === 0) return { scanned: 0, linked: 0 };

    const candidates = await Transactions.findAll({
      where: {
        userId,
        id: { [Op.in]: transactionIds },
        payeeId: null,
        payeeLocked: false,
        note: { [Op.ne]: null },
      },
      attributes: ['id', 'note'],
    });
    if (candidates.length === 0) return { scanned: 0, linked: 0 };

    const index = buildFuzzyIndex({ haystack: buildHaystack({ payees: userPayees }) });

    let linked = 0;
    for (const tx of candidates) {
      // Per-transaction try/catch: a single failure (e.g. concurrent row
      // update, alias UNIQUE collision from a parallel sync) must not abort
      // the remaining batch — Type B is best-effort enrichment, not a
      // critical write path.
      try {
        const raw = tx.note?.trim();
        if (!raw) continue;

        const match = index.search({ query: raw });
        if (!match) continue;

        const normalized = normalizePayeeName({ raw });
        if (!normalized) continue;

        await Transactions.update(
          { payeeId: match.payeeId },
          { where: { id: tx.id, userId, payeeId: null, payeeLocked: false } },
        );

        await ensureAliasExists({
          payeeId: match.payeeId,
          rawName: raw,
          normalizedName: normalized,
        });

        // Stamp `categorizationMeta` consistently with the create-time
        // payee-rule path. Without this an `enforce`-mode Payee that gets
        // linked via Type B (note-based fuzzy) would leave the row with
        // `categorizationMeta = null`, and the AI listener's NULL-filter
        // would then re-categorize it against the Payee's default.
        await applyPayeeCategorization({
          userId,
          transactionId: tx.id,
          payeeId: match.payeeId,
        });

        linked += 1;
        logger.info('[Payee Type B] fuzzy link via note', {
          userId,
          transactionId: tx.id,
          payeeId: match.payeeId,
          score: match.score,
        });
      } catch (error) {
        logger.error({
          message: '[Payee Type B] per-transaction link failed; continuing',
          error: error as Error,
        });
      }
    }

    return { scanned: candidates.length, linked };
  },
);
