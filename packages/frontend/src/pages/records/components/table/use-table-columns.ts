import { useUserSettings } from '@/composable/data-queries/user-settings';
import { useDebounceFn } from '@vueuse/core';
import { computed, ref, watch } from 'vue';

import {
  COLUMN_DEFINITIONS,
  COLUMN_DEFINITIONS_BY_ID,
  type ColumnDefinition,
  DEFAULT_VISIBLE_COLUMNS,
  TABLE_COLUMN,
  isKnownColumnId,
} from './columns';

const PERSIST_DEBOUNCE_MS = 1_000;

/**
 * Column visibility + order for the transactions table, persisted in
 * UserSettings under `ui.transactionsTable`. Unknown ids from settings are
 * dropped on read (a removed column must not break the table); known columns
 * missing from a stored order are appended in registry order so newly shipped
 * columns appear for existing users.
 */
export function useTableColumns() {
  const { data: userSettings, mutate: saveUserSettings } = useUserSettings();

  const localOrder = ref<TABLE_COLUMN[]>([...COLUMN_DEFINITIONS.map((definition) => definition.id)]);
  const localVisible = ref<TABLE_COLUMN[]>([...DEFAULT_VISIBLE_COLUMNS]);
  // Settings load async — hydrate local state once they arrive, but never
  // clobber edits the user already made in this session.
  const hasUserEdits = ref(false);

  const sanitizeOrder = (storedOrder: string[]): TABLE_COLUMN[] => {
    const known = storedOrder.filter(isKnownColumnId);
    const missing = COLUMN_DEFINITIONS.map((definition) => definition.id).filter((id) => !known.includes(id));
    return [...known, ...missing];
  };

  watch(
    () => userSettings.value?.ui?.transactionsTable,
    (stored) => {
      if (!stored || hasUserEdits.value) return;
      localOrder.value = sanitizeOrder(stored.columnOrder);
      const visible = stored.visibleColumns.filter(isKnownColumnId);
      if (visible.length > 0) localVisible.value = visible;
    },
    { immediate: true },
  );

  const persistDebounced = useDebounceFn(() => {
    const settings = userSettings.value;
    if (!settings) return;
    saveUserSettings({
      ...settings,
      ui: {
        ...settings.ui,
        // Spread first: transactionsTable also stores non-column prefs (mobileView)
        // that a column edit must not wipe.
        transactionsTable: {
          ...settings.ui?.transactionsTable,
          visibleColumns: localVisible.value,
          columnOrder: localOrder.value,
        },
      },
    });
  }, PERSIST_DEBOUNCE_MS);

  const markEditedAndPersist = () => {
    hasUserEdits.value = true;
    persistDebounced();
  };

  /** Columns to render, in user order. */
  const visibleColumns = computed<ColumnDefinition[]>(() =>
    localOrder.value.filter((id) => localVisible.value.includes(id)).map((id) => COLUMN_DEFINITIONS_BY_ID[id]),
  );

  /** All columns in user order, with visibility flag — for the config panel. */
  const configurableColumns = computed(() =>
    localOrder.value.map((id) => ({
      definition: COLUMN_DEFINITIONS_BY_ID[id],
      visible: localVisible.value.includes(id),
    })),
  );

  const toggleColumn = (id: TABLE_COLUMN) => {
    if (localVisible.value.includes(id)) {
      // Keep at least one column visible — an empty table is a dead end.
      if (localVisible.value.length === 1) return;
      localVisible.value = localVisible.value.filter((columnId) => columnId !== id);
    } else {
      localVisible.value = [...localVisible.value, id];
    }
    markEditedAndPersist();
  };

  const reorderColumns = (orderedIds: TABLE_COLUMN[]) => {
    localOrder.value = sanitizeOrder(orderedIds);
    markEditedAndPersist();
  };

  const resetToDefaults = () => {
    localOrder.value = [...COLUMN_DEFINITIONS.map((definition) => definition.id)];
    localVisible.value = [...DEFAULT_VISIBLE_COLUMNS];
    markEditedAndPersist();
  };

  return {
    visibleColumns,
    configurableColumns,
    toggleColumn,
    reorderColumns,
    resetToDefaults,
  };
}
