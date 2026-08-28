import { useUserSettings } from '@/composable/data-queries/user-settings';
import { captureException } from '@/lib/sentry';
import { useCategoriesStore } from '@/stores/categories/categories';
import { MAX_CATEGORY_MAPPING_PRESETS, type CategoryMappingConfig, type CategoryMappingPreset } from '@bt/shared/types';
import { type Ref, computed } from 'vue';

/**
 * Remembers the category mapping a finished import used, keyed by a fingerprint of the source
 * layout, so the next import from the same source can re-apply it. Each wizard supplies its own
 * fingerprint: a header-row hash for CSV, a constant for the fixed-layout sources.
 *
 * Naming a preset turns it into a template: it survives cap eviction and can be applied to any
 * source, not just the layout it was recorded from.
 */
export const useCategoryMappingPresets = ({ fingerprint }: { fingerprint: Ref<string | null> }) => {
  const userSettings = useUserSettings();

  const storedPresets = computed<CategoryMappingPreset[]>(
    () => userSettings.data.value?.import?.categoryMappingPresets ?? [],
  );

  const patchPresets = async ({ presets, scope }: { presets: CategoryMappingPreset[]; scope: string }) => {
    try {
      await userSettings.patchAsync({ import: { categoryMappingPresets: presets } });
    } catch (error) {
      captureException({ error, context: { scope } });
    }
  };

  /** The saved category mapping for this source layout, if one exists. */
  const matchingPreset = computed<CategoryMappingPreset | null>(
    () => storedPresets.value.find((preset) => preset.fingerprint === fingerprint.value) ?? null,
  );

  /** Named templates from other source layouts, newest first. */
  const namedPresets = computed<CategoryMappingPreset[]>(() =>
    storedPresets.value
      .filter((preset) => preset.name && preset.fingerprint !== fingerprint.value)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );

  /**
   * Writes the preset's mapping over the current choices, for source names this import
   * actually contains. Link targets deleted since the preset was saved are dropped rather
   * than written back as unresolvable ids.
   */
  const applyPreset = ({
    preset,
    categoryMapping,
    validSourceNames,
  }: {
    preset: CategoryMappingPreset;
    categoryMapping: Ref<CategoryMappingConfig>;
    validSourceNames: string[];
  }) => {
    const sourceNames = new Set(validSourceNames);
    const categoriesMap = useCategoriesStore().categoriesMap;

    for (const [name, value] of Object.entries(preset.categoryMapping)) {
      if (!sourceNames.has(name)) continue;
      if (value.action === 'link-existing' && !categoriesMap[value.categoryId]) continue;
      categoryMapping.value[name] = { ...value };
    }
  };

  /**
   * Remembers this run's category mapping against the source fingerprint, newest first,
   * so the next import from the same source can re-apply it. Over the cap, unnamed presets
   * are evicted oldest-first; named ones only go once nothing unnamed is left.
   *
   * ponytail: silent best-effort save — a failure only reaches Sentry. Add a toast if users
   * report losing presets.
   */
  const persistPreset = ({ mapping }: { mapping: CategoryMappingConfig }) => {
    if (!fingerprint.value || Object.keys(mapping).length === 0) return;

    const stored = storedPresets.value;
    const existingName = stored.find((preset) => preset.fingerprint === fingerprint.value)?.name;
    const presets: CategoryMappingPreset[] = [
      {
        fingerprint: fingerprint.value,
        ...(existingName ? { name: existingName } : {}),
        categoryMapping: mapping,
        updatedAt: new Date().toISOString(),
      },
      ...stored.filter((preset) => preset.fingerprint !== fingerprint.value),
    ];

    while (presets.length > MAX_CATEGORY_MAPPING_PRESETS) {
      const unnamedIndex = presets.findLastIndex((preset) => !preset.name);
      presets.splice(unnamedIndex === -1 ? presets.length - 1 : unnamedIndex, 1);
    }

    userSettings.patchAsync({ import: { categoryMappingPresets: presets } }).catch((error) => {
      captureException({ error, context: { scope: 'import-shared:persist-category-preset' } });
    });
  };

  /** Labels a preset in place: the stored order and `updatedAt` stay untouched. */
  const renamePreset = async ({ fingerprint: target, name }: { fingerprint: string; name: string }) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    await patchPresets({
      presets: storedPresets.value.map((preset) =>
        preset.fingerprint === target ? { ...preset, name: trimmed } : preset,
      ),
      scope: 'import-shared:rename-category-preset',
    });
  };

  const deletePreset = async ({ fingerprint: target }: { fingerprint: string }) => {
    await patchPresets({
      presets: storedPresets.value.filter((preset) => preset.fingerprint !== target),
      scope: 'import-shared:delete-category-preset',
    });
  };

  return { matchingPreset, namedPresets, applyPreset, persistPreset, renamePreset, deletePreset };
};
