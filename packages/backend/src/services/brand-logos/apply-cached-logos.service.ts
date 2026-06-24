import BrandLogos from '@models/brand-logos.model';
import { normalizePayeeName } from '@services/payees/normalize-name';

import type { LogoEntity, LogoResolvable } from './resolve-brand-logo.service';

/**
 * Normalized cache key for a row, matching `resolveBrandLogo`: payees carry a
 * precomputed `normalizedName`; subscriptions don't, so fall back to normalizing
 * `name` on the fly. Both consumers agree on this key so a cache row written by
 * one surfaces for the other.
 */
function cacheKeyForRow({ row }: { row: LogoResolvable }): string {
  return row.normalizedName?.trim() || normalizePayeeName({ raw: row.name });
}

/**
 * Synchronous cache-only apply for read paths (list/detail) and the eager
 * backfill. Loads `BrandLogos` for the given rows in a single read and stamps
 * `logoDomain` + `logoSource: 'auto'` on cache hits, so a hit surfaces the logo
 * on the SAME request rather than a request later. Returns the rows that missed
 * the cache so the caller can enqueue async resolution for them.
 *
 * Only touches rows with `logoSource == null` (never resolved). Already resolved
 * (`auto`) or user-overridden (`manual`) rows are left untouched and excluded
 * from the returned misses.
 *
 * Generic over the `LogoEntity` union via the shared `LogoResolvable` shape, so
 * payees and subscriptions go through identical logic. No API calls.
 */
export async function applyCachedLogos<T extends LogoResolvable>({
  entity,
  rows,
}: {
  entity: LogoEntity;
  rows: T[];
}): Promise<T[]> {
  const unresolved = rows.filter((row) => row.logoSource == null);
  if (unresolved.length === 0) return [];

  const keyByRow = new Map<T, string>();
  for (const row of unresolved) {
    keyByRow.set(row, cacheKeyForRow({ row }));
  }

  const distinctKeys = [...new Set([...keyByRow.values()].filter(Boolean))];
  // Every unresolved row has an empty key (no name to resolve) – all are misses.
  if (distinctKeys.length === 0) return unresolved;

  const cacheRows = await BrandLogos.findAll({ where: { normalizedName: distinctKeys } });
  const domainByKey = new Map(cacheRows.map((cacheRow) => [cacheRow.normalizedName, cacheRow.domain]));

  const misses: T[] = [];
  for (const row of unresolved) {
    const domain = domainByKey.get(keyByRow.get(row)!);
    if (domain !== undefined) {
      // No explicit transaction: Sequelize picks up the caller's ambient CLS
      // transaction when one is in scope (the payee read paths run inside
      // `withTransaction`), and auto-commits otherwise (the subscription read
      // path is not transactional). Either way the in-memory row is mutated so
      // the cache hit surfaces on this response.
      await row.update({ logoDomain: domain, logoSource: 'auto' });
    } else {
      misses.push(row);
    }
  }

  return misses;
}
