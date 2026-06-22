/**
 * Pure transforms behind the Resolve Values step's auto-match and quick actions.
 *
 * Each function computes the mapping entries to set for one entity type
 * (accounts / categories / tags) and returns them as a plain record; the caller
 * merges the result into the live mapping. The link/create entry shapes differ
 * per entity (accountId vs categoryId vs tagId), so callers pass `toLink` /
 * `toCreate` factories and this module stays entity-agnostic.
 *
 * Factory contract (uniform across every entity and caller): `toLink` always
 * receives `(id, name)` and `toCreate` always receives `(name)` — the matched
 * target id (for links) and the source name. Both arguments are always passed;
 * a factory that doesn't need the name simply ignores it (e.g. CSV's create-new
 * entry), while one that does uses it (e.g. a Wallet account's create-new entry
 * carrying that account's detected currency). No argument is ever omitted, so
 * the contract reads the same at every call site.
 *
 * Kept Vue/Pinia-free so it can be unit-tested in isolation.
 */
import { matchValuesByName } from './auto-match';

/** A source value to resolve. `currencyCode` enables currency-aware account matching. */
export interface ResolveSource {
  name: string;
  currencyCode?: string;
}

/** An existing entity a source can link to. */
export interface ResolveTarget {
  id: string;
  name: string;
  currencyCode?: string;
}

/**
 * Auto-match every source by name: link to a matched target, or fall back to
 * "create new" when nothing matches. Sources that already have an entry are left
 * untouched unless `overwrite` is true.
 *
 * Returns only the entries to set (keyed by source name) — sources skipped
 * because they were already decided are omitted.
 */
export function computeAutoMatchEntries<E extends { action: string }>({
  sources,
  targets,
  current,
  overwrite,
  toLink,
  toCreate,
}: {
  sources: ResolveSource[];
  targets: ResolveTarget[];
  current: Record<string, E | undefined>;
  overwrite: boolean;
  toLink: (id: string, name: string) => E;
  toCreate: (name: string) => E;
}): Record<string, E> {
  const matches = matchValuesByName({ sources, targets });
  const result: Record<string, E> = {};

  for (const source of sources) {
    if (!overwrite && current[source.name] !== undefined) continue;
    const matchedId = matches.get(source.name);
    result[source.name] = matchedId != null ? toLink(String(matchedId), source.name) : toCreate(source.name);
  }

  return result;
}

/**
 * Link only the sources that have an exact (normalised) name match, overwriting
 * any current choice for those rows. Sources with no match are omitted, so
 * already-decided rows without a match keep their existing entry.
 */
export function computeExactLinkEntries<E extends { action: string }>({
  sources,
  targets,
  toLink,
}: {
  sources: ResolveSource[];
  targets: ResolveTarget[];
  toLink: (id: string, name: string) => E;
}): Record<string, E> {
  const matches = matchValuesByName({ sources, targets });
  const result: Record<string, E> = {};

  for (const source of sources) {
    const matchedId = matches.get(source.name);
    if (matchedId != null) result[source.name] = toLink(String(matchedId), source.name);
  }

  return result;
}

/**
 * Produce a "create new" entry for every name the caller still considers
 * unresolved (e.g. no entry yet, or a link with no target chosen).
 */
export function computeCreateForUnresolved<E extends { action: string }>({
  names,
  current,
  isUnresolved,
  toCreate,
}: {
  names: string[];
  current: Record<string, E | undefined>;
  isUnresolved: (entry: E | undefined) => boolean;
  toCreate: (name: string) => E;
}): Record<string, E> {
  const result: Record<string, E> = {};

  for (const name of names) {
    if (isUnresolved(current[name])) result[name] = toCreate(name);
  }

  return result;
}
