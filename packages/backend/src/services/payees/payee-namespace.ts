import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import PayeeAliases from '@models/payee-aliases.model';
import Payees from '@models/payees.model';

import { normalizePayeeName } from './normalize-name';

/**
 * The user's payee name namespace.
 *
 * Invariant: a normalizedName — canonical Payee name or alias — resolves to at
 * most ONE Payee per user. The extraction pipeline's exact-match step
 * (`resolvePayeeForRawMerchant` → `resolveNormalizedName`) relies on this to
 * link incoming transactions deterministically. Every write path that
 * introduces a new normalizedName into the namespace (payee create, rename,
 * user-curated alias, merge) must consult this module before inserting.
 */

interface PayeeNamespaceHit {
  payeeId: string;
  name: string;
  /** Whether the normalizedName matched the Payee's canonical name or one of its aliases. */
  via: 'canonical' | 'alias';
}

/**
 * Resolve a normalizedName within one user's namespace. Canonical names win
 * over aliases (a canonical hit never needs an alias row to be addressable).
 *
 * `PayeeAliases` rows carry no `userId` — scoping happens through the required
 * join to the owning Payee. A bare `findOne({ normalizedName })` would match an
 * arbitrary user's alias row and shadow this user's own rows, producing false
 * negatives in conflict checks and cross-tenant-dependent behavior.
 */
export async function resolveNormalizedName({
  userId,
  normalized,
}: {
  userId: number;
  normalized: string;
}): Promise<PayeeNamespaceHit | null> {
  const canonical = await Payees.findOne({
    where: { userId, normalizedName: normalized },
    attributes: ['id', 'name'],
  });
  if (canonical) {
    return { payeeId: canonical.id, name: canonical.name, via: 'canonical' };
  }

  const aliasHit = await PayeeAliases.findOne({
    where: { normalizedName: normalized },
    include: [
      {
        model: Payees,
        as: 'payee',
        required: true,
        where: { userId },
        attributes: ['id', 'name'],
      },
    ],
  });
  if (aliasHit) {
    return { payeeId: aliasHit.payeeId, name: aliasHit.payee.name, via: 'alias' };
  }

  return null;
}

/**
 * Trim + normalize a user-provided payee/alias name, rejecting input that
 * normalizes to nothing (whitespace, punctuation-only strings). `display` is
 * what gets stored as the human-readable form; `normalized` is the namespace
 * key. `emptyMessageKey` lets each endpoint keep its own ValidationError copy.
 */
export function parsePayeeName({ raw, emptyMessageKey }: { raw: string; emptyMessageKey: string }): {
  display: string;
  normalized: string;
} {
  const display = raw.trim();
  if (!display) {
    throw new ValidationError({ message: t({ key: emptyMessageKey }) });
  }
  const normalized = normalizePayeeName({ raw: display });
  if (!normalized) {
    throw new ValidationError({ message: t({ key: emptyMessageKey }) });
  }
  return { display, normalized };
}

/**
 * Idempotent alias insert. `findOrCreate` collapses the check-then-create into
 * a single race-safe operation — UNIQUE (payeeId, normalizedName) plus
 * `findOrCreate` means a concurrent sync hitting the same merchant returns
 * the existing row instead of throwing.
 *
 * Deliberately does NOT consult `resolveNormalizedName`: callers (extraction
 * fuzzy-link, rename, merge) attach an alias to a Payee the name already
 * resolves to, so the namespace invariant holds by construction. Conflict
 * checking belongs to the user-facing write paths.
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
