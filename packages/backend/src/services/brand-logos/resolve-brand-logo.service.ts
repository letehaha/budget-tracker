import type { LogoResolutionState, LogoSource } from '@bt/shared/types';
import BrandLogos from '@models/brand-logos.model';
import Payees from '@models/payees.model';
import Subscriptions from '@models/subscriptions.model';
import { normalizePayeeName } from '@services/payees/normalize-name';
import { Transaction } from 'sequelize';

import { searchBrands } from './brand-logo-provider';

/** Entities that carry a denormalized brand logo (logoDomain + logoSource). */
export type LogoEntity = 'payee' | 'subscription';

/**
 * The minimal contract the resolver and cache-apply need from either backing
 * model. Payees carry a precomputed `normalizedName`; subscriptions don't, so
 * the resolver falls back to normalizing `name` on the fly. Both models expose
 * the same `logoDomain` / `logoSource` columns and a Sequelize `update`.
 *
 * `Payees` and `Subscriptions` are asserted to structurally satisfy this
 * interface below, so a column drift (renamed/retyped logo field) is a compile
 * error rather than a runtime crash inside `loadResolvable`.
 */
export interface LogoResolvable {
  name: string;
  normalizedName?: string | null;
  logoSource: LogoResolutionState;
  update(
    values: { logoDomain: string | null; logoSource: LogoSource },
    options?: { transaction?: Transaction | null },
  ): Promise<unknown>;
}

// Compile-time guard: if either model's logo fields drift from the resolver's
// contract, this assignment fails to typecheck. Instances are used (not the
// classes) because Sequelize's static-side typing is unrelated to row shape.
type ModelSatisfiesResolvable = [Payees, Subscriptions] extends [LogoResolvable, LogoResolvable] ? true : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _modelsSatisfyResolvable: ModelSatisfiesResolvable = true;

async function loadResolvable({
  entity,
  id,
  transaction,
}: {
  entity: LogoEntity;
  id: string;
  transaction: Transaction | null;
}): Promise<LogoResolvable | null> {
  return entity === 'payee'
    ? ((await Payees.findByPk(id, { transaction })) as LogoResolvable | null)
    : ((await Subscriptions.findByPk(id, { transaction })) as LogoResolvable | null);
}

/**
 * Resolve a single entity's brand logo and denormalize the result onto its row
 * (`logoDomain` + `logoSource: 'auto'`). Runs out-of-band in the logo-resolution
 * worker, one call per entity, keyed on the entity's normalized name.
 *
 * Lookup order:
 *   1. Shared `BrandLogos` cache (seeded common brands + prior logo.dev hits) –
 *      a hit costs zero API calls.
 *   2. logo.dev Brand Search on a miss; the winning result is written back to
 *      the shared cache so the next entity with the same normalizedName hits it.
 *
 * Never overrides a `logoSource: 'manual'` entity – manual logos are user
 * overrides the resolver treats as authoritative. A miss with no provider
 * result records a negative (`logoDomain: null, logoSource: 'auto'`) so the same
 * entity isn't re-resolved on every read.
 *
 * `transaction` defaults to `null` and is passed explicitly to every query.
 * Sequelize only injects the cls-hooked ambient transaction when
 * `options.transaction === undefined` (its `=== void 0` guard). Running in the
 * worker – which shares a process with the HTTP server – cls-hooked can bleed a
 * concurrent request's already-committed transaction into these writes, making
 * `update()` throw "commit has been called on this transaction". An explicit
 * `null` skips the CLS lookup entirely, which is more reliable than clearing the
 * ambient value (cls-hooked can't restore that across native promise
 * continuations).
 */
export async function resolveBrandLogo({
  entity,
  id,
  transaction = null,
}: {
  entity: LogoEntity;
  id: string;
  transaction?: Transaction | null;
}): Promise<void> {
  const target = await loadResolvable({ entity, id, transaction });

  if (!target) return; // Row deleted between enqueue and processing.

  // User override is authoritative; the resolver must never touch it.
  if (target.logoSource === 'manual') return;

  const norm = target.normalizedName?.trim() || normalizePayeeName({ raw: target.name });

  // Empty normalized form: can't key the cache or search – mark negative so it isn't retried.
  if (!norm) {
    await target.update({ logoDomain: null, logoSource: 'auto' }, { transaction });
    return;
  }

  // 1. Shared cache lookup – a hit costs zero API calls.
  const cached = await BrandLogos.findOne({ where: { normalizedName: norm }, transaction });
  if (cached) {
    await target.update({ logoDomain: cached.domain, logoSource: 'auto' }, { transaction });
    return;
  }

  // 2. Provider search on a cache miss. `searchBrands` returns [] on miss/unconfigured/malformed;
  // throws after exhausting retries on network/5xx errors, failing the job so BullMQ retries it.
  const results = await searchBrands({ query: target.name });

  // Prefer the result whose normalizedName matches; fall back to the top result.
  const best = results.find((result) => normalizePayeeName({ raw: result.name }) === norm) ?? results[0] ?? null;

  if (!best) {
    // Negative result – mark auto so this entity isn't re-queued on every read.
    await target.update({ logoDomain: null, logoSource: 'auto' }, { transaction });
    return;
  }

  // Race-safe cache write: if a concurrent worker inserted this normalizedName first,
  // `findOrCreate` returns the existing row and we adopt its domain so all entities agree.
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

  await target.update({ logoDomain: row.domain, logoSource: 'auto' }, { transaction });
}
