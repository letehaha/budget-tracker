<!--
  DateFormatExpansion — the full-width block beneath the Date row that FORCES
  an explicit day/month-order confirmation for the mapped date column. The
  suggestion engine (suggest-date-field-order, mirroring the backend detector)
  only pre-highlights an option with a "Suggested" badge — it never commits.

  Single exception: a column made up entirely of year-first ISO / compact
  shapes carries its order intrinsically, so the pick would be meaningless.
  That case auto-commits a deterministic order (the backend ignores it for
  ISO shapes) and renders a compact informational state instead of the select.

  Single source of truth is store.columnMapping.dateFieldOrder; the preview
  and mismatch warning re-derive live from the full CSV data.
-->
<template>
  <div v-if="analysis.isIsoOnly" class="text-muted-foreground flex items-center gap-2 text-xs">
    <CircleCheckIcon class="size-4 shrink-0" aria-hidden="true" />
    <span>{{ $t('pages.importExport.mapColumns.dateFormat.isoDetected') }}</span>
  </div>

  <template v-else>
    <div class="grid gap-3 @md/mapping-table:grid-cols-2">
      <div>
        <p class="text-muted-foreground mb-1.5 text-xs font-medium">
          {{ $t('pages.importExport.mapColumns.dateFormat.label') }}
          <span class="text-destructive-text" aria-hidden="true">*</span>
        </p>
        <SelectField
          :model-value="selectedOption"
          :values="orderOptions"
          required
          class="w-full"
          :placeholder="$t('pages.importExport.mapColumns.dateFormat.placeholder')"
          @update:model-value="handleOrderChange"
        >
          <template #item="{ item, label }">
            <span class="flex items-center gap-2">
              {{ label }}
              <span
                v-if="item.value === analysis.suggestion"
                class="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              >
                {{ $t('pages.importExport.mapColumns.dateFormat.suggestedBadge') }}
              </span>
            </span>
          </template>
        </SelectField>
      </div>

      <!-- Live preview of the first few date cells under the current selection. -->
      <div v-if="selectedOrder && previewCells.length > 0">
        <p class="text-muted-foreground mb-1.5 text-xs font-medium">
          {{ $t('pages.importExport.mapColumns.dateFormat.previewLabel') }}
        </p>
        <ul class="space-y-0.5 text-xs">
          <li v-for="cell in previewCells" :key="cell.raw" class="flex items-center gap-1.5">
            <span class="text-muted-foreground font-mono">{{ cell.raw }}</span>
            <span class="text-muted-foreground" aria-hidden="true">→</span>
            <span v-if="cell.formatted" class="font-medium">{{ cell.formatted }}</span>
            <span v-else class="text-warning-text">
              {{ $t('pages.importExport.mapColumns.dateFormat.previewUnrecognized') }}
            </span>
          </li>
        </ul>
      </div>
    </div>

    <!-- Cells that won't parse under the chosen order become invalid rows at import. -->
    <p v-if="selectedOrder && mismatchCount > 0" class="text-warning-text mt-2 text-xs font-medium" role="alert">
      {{ $t('pages.importExport.mapColumns.dateFormat.mismatchWarning', { count: mismatchCount }, mismatchCount) }}
    </p>
  </template>
</template>

<script setup lang="ts">
import SelectField from '@/components/fields/select-field.vue';
import { useImportExportStore } from '@/stores/import-export';
import type { DateFieldOrder } from '@bt/shared/types';
import { CircleCheckIcon } from '@lucide/vue';
import { format } from 'date-fns';
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import {
  countMismatchedDateCells,
  detectDateSeparator,
  getBrowserLocaleFieldOrder,
  parseDateCellParts,
  suggestDateFieldOrder,
} from '@/pages/import-export/utils/suggest-date-field-order';

const { t } = useI18n();

const importStore = useImportExportStore();

const MAX_PREVIEW_CELLS = 3;

// Separator fallback for option examples when the column has no
// ambiguous-family cell to borrow one from.
const DEFAULT_SEPARATOR = '/';

/** Non-empty cells of the mapped date column across the FULL data set (the
 *  50-row preview can miss values that first appear in later rows). */
const dateColumnValues = computed<string[]>(() => {
  const column = importStore.columnMapping.date;
  if (!column) return [];
  const index = importStore.csvHeaders.indexOf(column);
  if (index === -1) return [];

  const values: string[] = [];
  for (const row of importStore.csvDataRows) {
    const value = row[index]?.trim();
    if (value) values.push(value);
  }
  return values;
});

/** The browser locale's conventional order — informs the suggestion badge only. */
const localeFallback = getBrowserLocaleFieldOrder();

const analysis = computed(() => suggestDateFieldOrder({ values: dateColumnValues.value, localeFallback }));

// ISO shapes carry their order intrinsically and the backend parser ignores
// `dateFieldOrder` for them, so a day/month pick would be meaningless noise.
// Commit a deterministic value to satisfy the wire contract and unblock Next.
watch(
  () => [importStore.columnMapping.date, analysis.value.isIsoOnly] as const,
  ([, isIsoOnly]) => {
    if (isIsoOnly && !importStore.columnMapping.dateFieldOrder) {
      importStore.columnMapping.dateFieldOrder = 'month-first';
    }
  },
  { immediate: true },
);

const selectedOrder = computed<DateFieldOrder | null>(() => importStore.columnMapping.dateFieldOrder);

interface DateOrderOption {
  label: string;
  value: DateFieldOrder;
}

/** Concrete example (e.g. `31.12.2024`) rendered with the column's actual separator. */
const exampleFor = ({ order }: { order: DateFieldOrder }): string => {
  const separator = detectDateSeparator({ values: dateColumnValues.value }) ?? DEFAULT_SEPARATOR;
  return order === 'day-first' ? `31${separator}12${separator}2024` : `12${separator}31${separator}2024`;
};

const orderOptions = computed<DateOrderOption[]>(() => [
  {
    label: t('pages.importExport.mapColumns.dateFormat.dayFirstOption', {
      example: exampleFor({ order: 'day-first' }),
    }),
    value: 'day-first',
  },
  {
    label: t('pages.importExport.mapColumns.dateFormat.monthFirstOption', {
      example: exampleFor({ order: 'month-first' }),
    }),
    value: 'month-first',
  },
]);

const selectedOption = computed<DateOrderOption | null>(
  () => orderOptions.value.find((option) => option.value === selectedOrder.value) ?? null,
);

const handleOrderChange = (option: DateOrderOption | null) => {
  importStore.columnMapping.dateFieldOrder = option?.value ?? null;
};

interface PreviewCell {
  raw: string;
  /** Human-readable parse result, or `null` when the cell fails under the selection. */
  formatted: string | null;
}

/** First few distinct raw cells with their parse result under the current selection. */
const previewCells = computed<PreviewCell[]>(() => {
  const order = selectedOrder.value;
  if (!order) return [];

  const cells: PreviewCell[] = [];
  const seen = new Set<string>();
  for (const raw of dateColumnValues.value) {
    if (seen.has(raw)) continue;
    seen.add(raw);
    const parts = parseDateCellParts({ value: raw, fieldOrder: order });
    cells.push({
      raw,
      formatted: parts ? format(new Date(parts.year, parts.month - 1, parts.day), 'MMM d, yyyy') : null,
    });
    if (cells.length >= MAX_PREVIEW_CELLS) break;
  }
  return cells;
});

const mismatchCount = computed<number>(() => {
  const order = selectedOrder.value;
  if (!order) return 0;
  return countMismatchedDateCells({ values: dateColumnValues.value, fieldOrder: order });
});
</script>
