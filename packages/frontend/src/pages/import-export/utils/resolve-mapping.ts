/**
 * Pure transforms behind the Resolve Values step's auto-match and quick actions.
 *
 * Each function computes the mapping entries to set for one entity type
 * (accounts / categories / tags) and returns them as a plain record; the caller
 * merges the result into the live mapping. The link/create entry shapes differ
 * per entity (accountId vs categoryId vs tagId), so callers pass `toLink` /
 * `toCreate` factories and this module stays entity-agnostic.
 *
 * Kept Vue/Pinia-free so it can be unit-tested in isolation.
 */
import { matchValuesByName } from './auto-match';

/** A CSV-side value to resolve. `currencyCode` enables currency-aware account matching. */
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
export function computeAutoMatchEntries<E>({
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
  toLink: (id: string) => E;
  toCreate: () => E;
}): Record<string, E> {
  const matches = matchValuesByName({ sources, targets });
  const result: Record<string, E> = {};

  for (const source of sources) {
    if (!overwrite && current[source.name] !== undefined) continue;
    const matchedId = matches.get(source.name);
    result[source.name] = matchedId != null ? toLink(String(matchedId)) : toCreate();
  }

  return result;
}

/**
 * Link only the sources that have an exact (normalised) name match, overwriting
 * any current choice for those rows. Sources with no match are omitted, so
 * already-decided rows without a match keep their existing entry.
 */
export function computeExactLinkEntries<E>({
  sources,
  targets,
  toLink,
}: {
  sources: ResolveSource[];
  targets: ResolveTarget[];
  toLink: (id: string) => E;
}): Record<string, E> {
  const matches = matchValuesByName({ sources, targets });
  const result: Record<string, E> = {};

  for (const source of sources) {
    const matchedId = matches.get(source.name);
    if (matchedId != null) result[source.name] = toLink(String(matchedId));
  }

  return result;
}

/**
 * Produce a "create new" entry for every name the caller still considers
 * unresolved (e.g. no entry yet, or a link with no target chosen).
 */
export function computeCreateForUnresolved<E>({
  names,
  current,
  isUnresolved,
  toCreate,
}: {
  names: string[];
  current: Record<string, E | undefined>;
  isUnresolved: (entry: E | undefined) => boolean;
  toCreate: () => E;
}): Record<string, E> {
  const result: Record<string, E> = {};

  for (const name of names) {
    if (isUnresolved(current[name])) result[name] = toCreate();
  }

  return result;
}
