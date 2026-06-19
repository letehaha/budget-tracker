<!--
  CellColumnSelect — a cell-styled CSV-column picker used throughout the Map
  Columns tables.

  Already-matched de-prioritisation: columns already claimed by ANOTHER field stay
  selectable (a user may legitimately reuse one column) but are sorted to the BOTTOM
  of the list and rendered muted with an "(already matched)" suffix.
  They are NEVER disabled.
-->
<template>
  <SelectField
    :model-value="selectedOption"
    :values="options"
    label-key="column"
    value-key="column"
    :clearable="clearable"
    :required="required"
    with-search
    :search-keys="['column']"
    class="w-full"
    :placeholder="placeholder"
    @update:model-value="handleChange"
  >
    <template #item="{ item }">
      <span :class="cn('truncate', item.alreadyMatched && 'text-muted-foreground')">
        {{ item.column }}
        <span v-if="item.alreadyMatched" class="italic">
          {{ $t('pages.importExport.mapColumns.alreadyMatchedSuffix') }}
        </span>
      </span>
    </template>
  </SelectField>
</template>

<script setup lang="ts">
import SelectField from '@/components/fields/select-field.vue';
import { cn } from '@/lib/utils';
import { computed } from 'vue';

interface ColumnOption {
  /** The CSV header value; also the select's value key. */
  column: string;
  /** True when another field already uses this column ⇒ sorted last + muted. */
  alreadyMatched: boolean;
}

const props = defineProps<{
  /** Currently-selected CSV column header, or null when unset. */
  modelValue: string | null;
  /** All CSV headers available to pick from. */
  headers: string[];
  /** Headers already claimed by OTHER fields — demoted to the bottom and muted. */
  usedByOthers?: string[];
  required?: boolean;
  clearable?: boolean;
  placeholder?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
}>();

const usedSet = computed(() => new Set(props.usedByOthers ?? []));

/**
 * Options with already-matched columns sorted to the bottom. Original header
 * order is preserved within each group (available first, then already-matched).
 */
const options = computed<ColumnOption[]>(() => {
  const available: ColumnOption[] = [];
  const demoted: ColumnOption[] = [];

  for (const header of props.headers) {
    const option: ColumnOption = { column: header, alreadyMatched: usedSet.value.has(header) };
    (option.alreadyMatched ? demoted : available).push(option);
  }

  return [...available, ...demoted];
});

const selectedOption = computed<ColumnOption | null>(() => {
  if (!props.modelValue) return null;
  return options.value.find((option) => option.column === props.modelValue) ?? null;
});

const handleChange = (option: ColumnOption | null) => {
  emit('update:modelValue', option ? option.column : null);
};
</script>
