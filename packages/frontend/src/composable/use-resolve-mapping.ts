import {
  type ResolveSource,
  type ResolveTarget,
  computeAutoMatchEntries,
  computeCreateForUnresolved,
  computeExactLinkEntries,
} from '@/pages/import-export/utils/resolve-mapping';
import { type ComputedRef, type Ref, computed } from 'vue';

/**
 * Shared "Resolve step" engine for the import wizards (CSV + Wallet). Both
 * wizards reconcile a list of source values (accounts / categories / tags
 * discovered in the imported file) against the user's existing app entities,
 * each row resolving to either "create new" or "link to an existing entity".
 * The bulk actions, resolved-counts, and overall step-validity are identical in
 * shape across wizards; only the per-entity data and entry shapes differ. This
 * composable owns that shared logic; each store supplies a per-entity config and
 * re-exposes the returned getters/actions under its own public names.
 *
 * The pure transforms live in `resolve-mapping.ts`; this composable is the
 * Vue/Pinia-aware layer that wires reactive store state into them.
 */

/**
 * Per-entity wiring. The entry type `E` is the store's mapping value for that
 * entity (e.g. CSV's `AccountMappingValue`, Wallet's account form value,
 * `TagMappingValue`). The engine never inspects `E` beyond its `action` tag –
 * shape-specific construction is delegated to `toLink` / `toCreate`.
 */
interface ResolveEntityConfig<E extends { action: string }> {
  /**
   * Whether this entity participates in the current resolve step. CSV gates each
   * entity on whether its column mapping needs reconciliation; Wallet's entities
   * are always active. Inactive entities are skipped by every action and ignored
   * by validity/counts.
   */
  isActive: () => boolean;
  /** Source values to resolve, read from reactive store state. */
  getSources: () => ResolveSource[];
  /** Existing app entities offered as link targets, read from reactive store state. */
  getTargets: () => ResolveTarget[];
  /** The live mapping this entity writes into (keyed by source name). */
  mapping: Ref<Record<string, E>>;
  /**
   * Builds a "link to existing" entry. Always receives the matched target id and
   * the source name; entities that don't need the name (most) ignore it.
   */
  toLink: (id: string, name: string) => E;
  /**
   * Builds a "create new" entry. Always receives the source name; entities that
   * carry name-derived data (e.g. a Wallet account's detected currency) use it,
   * others ignore it.
   */
  toCreate: (name: string) => E;
  /**
   * Builds a "skip" entry. Only tags support skipping, so only the tags config
   * provides this; `quickSkipAllTags` is a no-op for any entity that omits it.
   */
  toSkip?: () => E;
  /**
   * Whether an entry counts as fully decided. `create-new` is always resolved;
   * `link-existing` is resolved only once a concrete target id is chosen. Each
   * entity defines this because the id field name and "no target yet" sentinel
   * differ (e.g. Wallet accounts use `undefined`, CSV uses an empty string).
   */
  isResolved: (entry: E | undefined) => boolean;
}

/** Entity identifiers the dispatching actions accept. */
type ResolveEntityKind = 'accounts' | 'categories' | 'tags';

/**
 * Builds the shared resolve engine over the given per-entity configs. `accounts`
 * and `categories` are always present; `tags` is optional (CSV has tags, Wallet
 * does not). Returns reactive getters and bulk actions for the store to re-expose.
 */
export function useResolveMapping<
  EAccount extends { action: string },
  ECategory extends { action: string },
  ETag extends { action: string } = never,
>({
  accounts,
  categories,
  tags,
  unmarkedDuplicateIndices,
}: {
  accounts: ResolveEntityConfig<EAccount>;
  categories: ResolveEntityConfig<ECategory>;
  tags?: ResolveEntityConfig<ETag>;
  /**
   * Row indices the user has un-marked as "import anyway" despite being detected
   * as duplicates. Owned by the store; this composable only toggles membership.
   */
  unmarkedDuplicateIndices: Ref<Set<number>>;
}) {
  // S6: cache sources/targets as computeds (not re-derived on every read). The
  // getters read reactive store state, so dependency tracking still works.
  const accountSources = computed(() => accounts.getSources());
  const accountTargets = computed(() => accounts.getTargets());
  const categorySources = computed(() => categories.getSources());
  const categoryTargets = computed(() => categories.getTargets());
  const tagSources = computed(() => (tags ? tags.getSources() : []));
  const tagTargets = computed(() => (tags ? tags.getTargets() : []));

  // ---- Per-entity primitives (generic over the concrete entry type) ----
  //
  // Each public action below dispatches on the entity kind and forwards the
  // matching config + source/target computeds to one of these. Keeping the
  // generic parameter bound to a single concrete `E` per call (rather than a
  // union of all three) lets TypeScript infer the factory/entry types cleanly.

  /** Name auto-match for one entity: link matched targets, else create-new. */
  function runAutoMatch<E extends { action: string }>({
    config,
    sources,
    targets,
    overwrite,
  }: {
    config: ResolveEntityConfig<E>;
    sources: ComputedRef<ResolveSource[]>;
    targets: ComputedRef<ResolveTarget[]>;
    overwrite: boolean;
  }): void {
    Object.assign(
      config.mapping.value,
      computeAutoMatchEntries<E>({
        sources: sources.value,
        targets: targets.value,
        current: config.mapping.value,
        overwrite,
        toLink: config.toLink,
        toCreate: config.toCreate,
      }),
    );
  }

  /** Link only the exact-name matches for one entity, overwriting those rows. */
  function runExactMatch<E extends { action: string }>({
    config,
    sources,
    targets,
  }: {
    config: ResolveEntityConfig<E>;
    sources: ComputedRef<ResolveSource[]>;
    targets: ComputedRef<ResolveTarget[]>;
  }): void {
    Object.assign(
      config.mapping.value,
      computeExactLinkEntries<E>({
        sources: sources.value,
        targets: targets.value,
        toLink: config.toLink,
      }),
    );
  }

  /** Create-new for every still-unresolved row of one entity. */
  function runCreateUnmatched<E extends { action: string }>({
    config,
    sources,
  }: {
    config: ResolveEntityConfig<E>;
    sources: ComputedRef<ResolveSource[]>;
  }): void {
    Object.assign(
      config.mapping.value,
      computeCreateForUnresolved<E>({
        names: sources.value.map((source) => source.name),
        current: config.mapping.value,
        isUnresolved: (entry) => !config.isResolved(entry),
        toCreate: config.toCreate,
      }),
    );
  }

  /** Clear one entity's stored choices for every current source row. */
  function clearEntity<E extends { action: string }>({
    config,
    sources,
  }: {
    config: ResolveEntityConfig<E>;
    sources: ComputedRef<ResolveSource[]>;
  }): void {
    for (const source of sources.value) delete config.mapping.value[source.name];
  }

  /**
   * Pre-fills every active entity's mapping by name: link to a matched existing
   * entity, else fall back to "create new". With `overwrite: false`, rows the
   * user already decided are left untouched.
   */
  function autoMatchResolveValues({ overwrite }: { overwrite: boolean }): void {
    if (accounts.isActive())
      runAutoMatch({ config: accounts, sources: accountSources, targets: accountTargets, overwrite });
    if (categories.isActive()) {
      runAutoMatch({ config: categories, sources: categorySources, targets: categoryTargets, overwrite });
    }
    if (tags?.isActive()) runAutoMatch({ config: tags, sources: tagSources, targets: tagTargets, overwrite });
  }

  /** Link only the exact-name matches for one entity, overwriting those rows. */
  function quickMapExactMatches({ entity }: { entity: ResolveEntityKind }): void {
    if (entity === 'accounts') runExactMatch({ config: accounts, sources: accountSources, targets: accountTargets });
    else if (entity === 'categories') {
      runExactMatch({ config: categories, sources: categorySources, targets: categoryTargets });
    } else if (tags) runExactMatch({ config: tags, sources: tagSources, targets: tagTargets });
  }

  /** Set "create new" for every still-unresolved row of one entity. */
  function quickCreateNewForUnmatched({ entity }: { entity: ResolveEntityKind }): void {
    if (entity === 'accounts') runCreateUnmatched({ config: accounts, sources: accountSources });
    else if (entity === 'categories') runCreateUnmatched({ config: categories, sources: categorySources });
    else if (tags) runCreateUnmatched({ config: tags, sources: tagSources });
  }

  /**
   * Mark every source value of the tags entity as skipped. No-op when tags are
   * not configured (Wallet) or provide no `toSkip` factory. Tags are the only
   * entity with a `skip` action, so this lives here rather than as a generic
   * per-entity action.
   */
  function quickSkipAllTags(): void {
    if (!tags?.toSkip) return;
    const buildSkip = tags.toSkip;
    for (const source of tagSources.value) {
      tags.mapping.value[source.name] = buildSkip();
    }
  }

  /** Clear one entity's stored choices, then re-seed via name auto-match. */
  function resetResolveEntity({ entity }: { entity: ResolveEntityKind }): void {
    if (entity === 'accounts') clearEntity({ config: accounts, sources: accountSources });
    else if (entity === 'categories') clearEntity({ config: categories, sources: categorySources });
    else if (tags) clearEntity({ config: tags, sources: tagSources });
    autoMatchResolveValues({ overwrite: false });
  }

  /**
   * Toggles whether a detected duplicate row will be skipped or imported.
   * Un-marking a row means "import it anyway despite it looking like a duplicate."
   */
  function toggleDuplicateUnmark({ rowIndex }: { rowIndex: number }): void {
    if (unmarkedDuplicateIndices.value.has(rowIndex)) {
      unmarkedDuplicateIndices.value.delete(rowIndex);
    } else {
      unmarkedDuplicateIndices.value.add(rowIndex);
    }
  }

  /** Count of resolved rows for one entity (used by per-section "X / Y resolved" labels). */
  function resolvedCountFor<E extends { action: string }>(
    config: ResolveEntityConfig<E>,
    sources: ComputedRef<ResolveSource[]>,
  ): number {
    let resolved = 0;
    for (const source of sources.value) {
      if (config.isResolved(config.mapping.value[source.name])) resolved += 1;
    }
    return resolved;
  }

  const accountResolvedCount = computed(() => resolvedCountFor(accounts, accountSources));
  const categoryResolvedCount = computed(() => resolvedCountFor(categories, categorySources));
  const tagResolvedCount = computed(() => (tags ? resolvedCountFor(tags, tagSources) : 0));

  /**
   * The resolve step is valid when every active entity has every one of its
   * source rows resolved. Inactive entities impose no constraint.
   */
  const isResolveStepValid = computed(() => {
    if (
      accounts.isActive() &&
      !accountSources.value.every((s) => accounts.isResolved(accounts.mapping.value[s.name]))
    ) {
      return false;
    }
    if (
      categories.isActive() &&
      !categorySources.value.every((s) => categories.isResolved(categories.mapping.value[s.name]))
    ) {
      return false;
    }
    if (tags?.isActive() && !tagSources.value.every((s) => tags.isResolved(tags.mapping.value[s.name]))) {
      return false;
    }
    return true;
  });

  return {
    autoMatchResolveValues,
    quickMapExactMatches,
    quickCreateNewForUnmatched,
    quickSkipAllTags,
    resetResolveEntity,
    toggleDuplicateUnmark,
    accountResolvedCount,
    categoryResolvedCount,
    tagResolvedCount,
    isResolveStepValid,
  };
}
