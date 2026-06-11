import { EXTRA_FILTER_KEYS, type ExtraFilterKey } from '@/components/records-filters/filter-registry';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { computed, ref } from 'vue';

/**
 * User-added filters of the transactions filter bar, persisted in UserSettings
 * under `ui.transactionsTable.extraFilters` (array order = render order). A local
 * override shadows the stored value so add/remove feels instant while the
 * settings mutation is in flight.
 */
export function useExtraFilters() {
  const { data: userSettings, patch: patchSettings } = useUserSettings();

  const localList = ref<ExtraFilterKey[] | null>(null);

  const extraFilters = computed<ExtraFilterKey[]>(() => {
    const stored = localList.value ?? userSettings.value?.ui?.transactionsTable?.extraFilters ?? [];
    // Settings may hold ids of filters that no longer exist – drop them on read.
    return stored.filter((key): key is ExtraFilterKey => (EXTRA_FILTER_KEYS as readonly string[]).includes(key));
  });

  const persist = (next: ExtraFilterKey[]) => {
    localList.value = next;
    patchSettings({ ui: { transactionsTable: { extraFilters: next } } });
  };

  const addExtraFilter = (key: ExtraFilterKey) => {
    if (extraFilters.value.includes(key)) return;
    persist([...extraFilters.value, key]);
  };

  const removeExtraFilter = (key: ExtraFilterKey) => {
    persist(extraFilters.value.filter((stored) => stored !== key));
  };

  return { extraFilters, addExtraFilter, removeExtraFilter };
}
