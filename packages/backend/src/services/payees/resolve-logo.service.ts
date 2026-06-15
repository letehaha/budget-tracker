import BrandLogos from '@models/brand-logos.model';
import Payees from '@models/payees.model';
import { Transaction } from 'sequelize';

import { searchBrands } from './logo-provider';
import { normalizePayeeName } from './normalize-name';

/**
 * Resolve a single Payee's brand logo and denormalize the result onto the
 * Payee row (`logoDomain` + `logoSource: 'auto'`). Runs out-of-band in the
 * logo-resolution worker, one call per Payee, keyed on the Payee's
 * `normalizedName`.
 *
 * Lookup order:
 *   1. Shared `BrandLogos` cache (seeded common brands + prior logo.dev hits) —
 *      a hit costs zero API calls.
 *   2. logo.dev Brand Search on a miss; the winning result is written back to
 *      the shared cache so the next Payee with the same normalizedName hits it.
 *
 * Never overrides a `logoSource: 'manual'` Payee — manual logos are user
 * overrides that the resolver treats as authoritative. A miss with no provider
 * result records a per-Payee negative (`logoDomain: null, logoSource: 'auto'`)
 * so the same Payee isn't re-resolved on every read.
 *
 * `transaction` defaults to `null` and is passed explicitly to every query.
 * Sequelize only injects the cls-hooked ambient transaction when
 * `options.transaction === undefined` (its `=== void 0` guard). Running in the
 * worker — which shares a process with the HTTP server — cls-hooked can bleed a
 * concurrent request's already-committed transaction into these writes, making
 * `payee.update()` throw "commit has been called on this transaction". An
 * explicit `null` skips the CLS lookup entirely, which is more reliable than
 * clearing the ambient value (cls-hooked can't restore that across native
 * promise continuations).
 */
export async function resolveLogoForPayee({
  payeeId,
  transaction = null,
}: {
  payeeId: string;
  transaction?: Transaction | null;
}): Promise<void> {
  const payee = await Payees.findByPk(payeeId, { transaction });

  // Payee deleted between enqueue and processing — nothing to resolve.
  if (!payee) return;

  // User override is authoritative; the resolver must never touch it.
  if (payee.logoSource === 'manual') return;

  const norm = payee.normalizedName?.trim() || normalizePayeeName({ raw: payee.name });

  // An empty normalized form can't key the cache or a meaningful search — mark
  // it resolved-to-nothing so it isn't retried.
  if (!norm) {
    await payee.update({ logoDomain: null, logoSource: 'auto' }, { transaction });
    return;
  }

  // Step 1: shared cache lookup. A hit is a zero-API resolution.
  const cached = await BrandLogos.findOne({ where: { normalizedName: norm }, transaction });
  if (cached) {
    await payee.update({ logoDomain: cached.domain, logoSource: 'auto' }, { transaction });
    return;
  }

  // Step 2: provider search on a cache miss. `searchBrands` returns [] (never
  // throws) when the provider is unconfigured or has no match.
  const results = await searchBrands({ query: payee.name });

  // Prefer a result whose own normalized name matches this Payee's; otherwise
  // fall back to the provider's top result.
  const best = results.find((result) => normalizePayeeName({ raw: result.name }) === norm) ?? results[0] ?? null;

  if (!best) {
    // Resolved to nothing — per-Payee negative, not retried.
    await payee.update({ logoDomain: null, logoSource: 'auto' }, { transaction });
    return;
  }

  // Race-safe write to the shared cache: a concurrent worker may have inserted
  // this normalizedName first. `findOrCreate` returns the existing row in that
  // case, and we adopt ITS domain so all Payees with this normalizedName agree.
  const [row] = await BrandLogos.findOrCreate({
    where: { normalizedName: norm },
    defaults: {
      normalizedName: norm,
      domain: best.domain,
      brandName: best.name,
      source: 'logodev',
    },
    transaction,
  });

  await payee.update({ logoDomain: row.domain, logoSource: 'auto' }, { transaction });
}

/**
 * Cache-only batch apply for bulk/backfill paths. Applies seed + cache hits to
 * the given Payees with a single `BrandLogos` read and zero API calls, then
 * returns the Payees that missed the cache so the caller can enqueue async
 * resolution for them.
 *
 * Only touches Payees with `logoSource == null` (never resolved). Already
 * resolved (`auto`) or user-overridden (`manual`) Payees are left untouched and
 * excluded from the returned misses.
 */
export async function applyCachedLogosToPayees({ payees }: { payees: Payees[] }): Promise<Payees[]> {
  const unresolved = payees.filter((payee) => payee.logoSource == null);
  if (unresolved.length === 0) return [];

  const distinctNames = [...new Set(unresolved.map((payee) => payee.normalizedName).filter(Boolean))];
  if (distinctNames.length === 0) return unresolved;

  const rows = await BrandLogos.findAll({ where: { normalizedName: distinctNames } });
  const domainByName = new Map(rows.map((row) => [row.normalizedName, row.domain]));

  const misses: Payees[] = [];
  for (const payee of unresolved) {
    const domain = domainByName.get(payee.normalizedName);
    if (domain !== undefined) {
      await payee.update({ logoDomain: domain, logoSource: 'auto' });
    } else {
      misses.push(payee);
    }
  }

  return misses;
}
