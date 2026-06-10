import { useUserSettings } from '@/composable/data-queries/user-settings';
import { computed, ref } from 'vue';

/** Filters the user can add to the filter bar via the "+" menu. The always-visible
 * trio (date range, accounts, categories) is not part of this list. */
export const EXTRA_FILTER_KEYS = [
  'type',
  'tags',
  'payees',
  'amount',
  'transferKinds',
  'refunds',
  'transfers',
  'note',
] as const;

export type ExtraFilterKey = (typeof EXTRA_FILTER_KEYS)[number];

/**
 * User-added filters of the transactions filter bar, persisted in UserSettings
 * under `ui.transactionsTable.extraFilters` (array order = render order). A local
 * override shadows the stored value so add/remove feels instant while the
 * settings mutation is in flight.
 */
export function useExtraFilters() {
  const { data: userSettings, mutate: saveUserSettings } = useUserSettings();

  const localList = ref<ExtraFilterKey[] | null>(null);

  const extraFilters = computed<ExtraFilterKey[]>(() => {
    const stored = localList.value ?? userSettings.value?.ui?.transactionsTable?.extraFilters ?? [];
    // Settings may hold ids of filters that no longer exist — drop them on read.
    return stored.filter((key): key is ExtraFilterKey => (EXTRA_FILTER_KEYS as readonly string[]).includes(key));
  });

  const persist = (next: ExtraFilterKey[]) => {
    localList.value = next;

    const settings = userSettings.value;
    if (!settings) return;
    saveUserSettings({
      ...settings,
      ui: {
        ...settings.ui,
        // Defaults first, stored values second: keeps the user's column config
        // when it exists, satisfies the schema when it doesn't.
        transactionsTable: {
          visibleColumns: [],
          columnOrder: [],
          ...settings.ui?.transactionsTable,
          extraFilters: next,
        },
      },
    });
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
