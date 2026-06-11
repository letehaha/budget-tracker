import { useUserSettings } from '@/composable/data-queries/user-settings';
import { useDebounceFn } from '@vueuse/core';
import { computed, ref, watch } from 'vue';

import {
  COLUMN_DEFINITIONS_BY_ID,
  DEFAULT_COLUMN_ORDER,
  DEFAULT_VISIBLE_COLUMNS,
  INVESTMENT_TX_COLUMN,
  type InvestmentTxColumnDefinition,
  isKnownColumnId,
} from './columns';

const PERSIST_DEBOUNCE_MS = 1_000;

/**
 * Column visibility + order for the investment transactions table, persisted in
 * UserSettings under `ui.investmentTransactionsTable`. Unknown ids from settings
 * are dropped on read (a removed column must not break the table); known columns
 * missing from a stored order are appended in registry order so newly shipped
 * columns appear for existing users.
 *
 * Mirrors `pages/records/components/table/use-table-columns.ts` — kept separate
 * because the registry and persistence key differ.
 */
export function useInvestmentTxTableColumns() {
  const { data: userSettings, patch: patchSettings } = useUserSettings();

  const localOrder = ref<INVESTMENT_TX_COLUMN[]>([...DEFAULT_COLUMN_ORDER]);
  const localVisible = ref<INVESTMENT_TX_COLUMN[]>([...DEFAULT_VISIBLE_COLUMNS]);
  // Settings load async — hydrate local state once they arrive, but never
  // clobber edits the user already made in this session.
  const hasUserEdits = ref(false);

  const sanitizeOrder = (storedOrder: string[]): INVESTMENT_TX_COLUMN[] => {
    const known = storedOrder.filter(isKnownColumnId);
    const missing = DEFAULT_COLUMN_ORDER.filter((id) => !known.includes(id));
    return [...known, ...missing];
  };

  watch(
    () => userSettings.value?.ui?.investmentTransactionsTable,
    (stored) => {
      if (!stored || hasUserEdits.value) return;
      localOrder.value = sanitizeOrder(stored.columnOrder);
      const visible = stored.visibleColumns.filter(isKnownColumnId);
      if (visible.length > 0) localVisible.value = visible;
    },
    { immediate: true },
  );

  const persistDebounced = useDebounceFn(() => {
    patchSettings({
      ui: { investmentTransactionsTable: { visibleColumns: localVisible.value, columnOrder: localOrder.value } },
    });
  }, PERSIST_DEBOUNCE_MS);

  const markEditedAndPersist = () => {
    hasUserEdits.value = true;
    persistDebounced();
  };

  /** Columns to render, in user order. */
  const visibleColumns = computed<InvestmentTxColumnDefinition[]>(() =>
    localOrder.value.filter((id) => localVisible.value.includes(id)).map((id) => COLUMN_DEFINITIONS_BY_ID[id]),
  );

  /** All columns in user order, with visibility flag — for the config panel. */
  const configurableColumns = computed(() =>
    localOrder.value.map((id) => ({
      definition: COLUMN_DEFINITIONS_BY_ID[id],
      visible: localVisible.value.includes(id),
    })),
  );

  const toggleColumn = (id: string) => {
    if (!isKnownColumnId(id)) return;
    if (localVisible.value.includes(id)) {
      // Keep at least one column visible — an empty table is a dead end.
      if (localVisible.value.length === 1) return;
      localVisible.value = localVisible.value.filter((columnId) => columnId !== id);
    } else {
      localVisible.value = [...localVisible.value, id];
    }
    markEditedAndPersist();
  };

  const reorderColumns = (orderedIds: string[]) => {
    localOrder.value = sanitizeOrder(orderedIds);
    markEditedAndPersist();
  };

  const resetToDefaults = () => {
    localOrder.value = [...DEFAULT_COLUMN_ORDER];
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
