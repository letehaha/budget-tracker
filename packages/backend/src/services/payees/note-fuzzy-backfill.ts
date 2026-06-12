import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import PayeeAliases from '@models/payee-aliases.model';
import Payees from '@models/payees.model';
import Transactions from '@models/transactions.model';
import { Op } from 'sequelize';

import { withTransaction } from '../common/with-transaction';
import { applyPayeeCategorization } from './apply-categorization';
import { buildFuzzyIndex, buildHaystack } from './fuzzy-matcher';
import { normalizePayeeName } from './normalize-name';
import { ensureAliasExists } from './payee-namespace';

interface NoteFuzzyBackfillInput {
  /**
   * Owner of the accounts to backfill. The candidate query joins
   * `Accounts` so any row on an account owned by this user is in scope —
   * including rows authored by a shared-account recipient. Decoupling
   * candidate selection from `tx.userId` removes an implicit contract
   * between the SYNCED emitter and this listener (today's bank providers
   * happen to insert with `tx.userId == account.userId`, but a future
   * emit site that doesn't preserve that invariant would otherwise
   * silently skip cross-creator rows).
   */
  userId: number;
  transactionIds: string[];
}

interface NoteFuzzyBackfillResult {
  scanned: number;
  linked: number;
}

const LOG_PREFIX = '[Payee note-backfill]';

/**
 * Post-sync note fuzzy backfill.
 *
 * Secondary Payee resolver that runs after a bank/import sync completes.
 * Unlike the inline sync-time extraction (`resolvePayeeForRawMerchant`),
 * which keys off the provider-supplied `rawMerchantName`, this pass uses
 * the transaction's `note` (description) as the fuzzy-match signal. It's
 * the fallback for providers that leave the merchant column empty but
 * pack the merchant name into the description (e.g., Monobank's
 * `description` field on most card purchases).
 *
 * Candidate selection: rows whose parent `Account.userId` matches the
 * input `userId` (the account owner), AND `payeeId IS NULL`, AND
 * `payeeLocked = false`, AND `note IS NOT NULL`. Builds a single Fuse
 * index over the user's Payees + aliases and searches each candidate's
 * `note`. On a match: link to that Payee and add the note as an alias so
 * future syncs hit the exact-match path. Does NOT do
 * occurrence-based promotion (i.e. never spins up new Payees here) — the
 * signal from `note` is weaker than a provider-supplied merchant name,
 * so promotion stays inline-only.
 */
export const runNoteFuzzyBackfill = withTransaction(
  async ({ userId, transactionIds }: NoteFuzzyBackfillInput): Promise<NoteFuzzyBackfillResult> => {
    if (transactionIds.length === 0) return { scanned: 0, linked: 0 };

    const userPayees = await Payees.findAll({
      where: { userId },
      include: [{ model: PayeeAliases, as: 'aliases' }],
    });
    if (userPayees.length === 0) return { scanned: 0, linked: 0 };

    // Scope candidates by `Account.userId` (account ownership), not
    // `Transactions.userId` (row creator). See the input doc for why.
    const candidates = await Transactions.findAll({
      where: {
        id: { [Op.in]: transactionIds },
        payeeId: null,
        payeeLocked: false,
        note: { [Op.ne]: null },
      },
      include: [
        {
          model: Accounts,
          where: { userId },
          required: true,
          attributes: [],
        },
      ],
      attributes: ['id', 'note'],
    });
    if (candidates.length === 0) return { scanned: 0, linked: 0 };

    const index = buildFuzzyIndex({ haystack: buildHaystack({ payees: userPayees }) });

    let linked = 0;
    for (const tx of candidates) {
      // Per-transaction try/catch: a single failure (e.g. concurrent row
      // update, alias UNIQUE collision from a parallel sync) must not abort
      // the remaining batch — this pass is best-effort enrichment, not a
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
          // Update by id only — auth was established at the candidate
          // fetch via the Accounts JOIN. `payeeId IS NULL AND
          // payeeLocked = false` stays in the WHERE as the idempotency
          // guard against a concurrent sync linking the same row first.
          { where: { id: tx.id, payeeId: null, payeeLocked: false } },
        );

        await ensureAliasExists({
          payeeId: match.payeeId,
          rawName: raw,
          normalizedName: normalized,
        });

        // Stamp `categorizationMeta` consistently with the inline
        // payee-rule path. Without this an `enforce`-mode Payee that gets
        // linked here via fuzzy note match would leave the row with
        // `categorizationMeta = null`, and the AI listener's NULL-filter
        // would then re-categorize it against the Payee's default.
        await applyPayeeCategorization({
          accountOwnerUserId: userId,
          transactionId: tx.id,
          payeeId: match.payeeId,
        });

        linked += 1;
        logger.info(`${LOG_PREFIX} fuzzy link via note`, {
          userId,
          transactionId: tx.id,
          payeeId: match.payeeId,
          score: match.score,
        });
      } catch (error) {
        logger.error({
          message: `${LOG_PREFIX} per-transaction link failed; continuing`,
          error: error as Error,
        });
      }
    }

    return { scanned: candidates.length, linked };
  },
);
