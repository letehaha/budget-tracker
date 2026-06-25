<!--
  TransactionTypeExpansion — the full-width block that renders beneath the
  Transaction type row when its method is "From column". Three dependent inputs:
  the type column (cell-select) plus comma-separated Income / Expense value lists
  (shared InputField).

  Single source of truth is store.columnMapping.transactionType; income/expense
  arrays are parsed from the comma-separated inputs on every change.
-->
<template>
  <div class="grid gap-3 @md/mapping-table:grid-cols-3">
    <div>
      <p class="text-muted-foreground mb-1.5 text-xs font-medium">
        {{ $t('pages.importExport.transactionTypeMapping.columnLabel') }}
        <span class="text-destructive-text" aria-hidden="true">*</span>
      </p>
      <CellColumnSelect
        :model-value="columnName"
        :headers="importStore.csvHeaders"
        :used-by-others="usedByOthers"
        required
        :placeholder="$t('pages.importExport.transactionTypeMapping.selectColumn')"
        @update:model-value="handleColumnChange"
      />
    </div>

    <InputField
      :model-value="incomeValuesInput"
      :label="$t('pages.importExport.transactionTypeMapping.incomeValuesLabel')"
      type="text"
      :placeholder="$t('pages.importExport.transactionTypeMapping.incomeValuesPlaceholder')"
      @update:model-value="handleIncomeChange"
    >
      <template #label-after>
        <span class="text-destructive-text" aria-hidden="true">*</span>
      </template>
    </InputField>

    <InputField
      :model-value="expenseValuesInput"
      :label="$t('pages.importExport.transactionTypeMapping.expenseValuesLabel')"
      type="text"
      :placeholder="$t('pages.importExport.transactionTypeMapping.expenseValuesPlaceholder')"
      @update:model-value="handleExpenseChange"
    >
      <template #label-after>
        <span class="text-destructive-text" aria-hidden="true">*</span>
      </template>
    </InputField>
  </div>

  <p class="text-muted-foreground mt-2 text-xs">
    {{ $t('pages.importExport.transactionTypeMapping.commaSeparatedHint') }}
  </p>

  <!-- Values present in the column but not yet assigned to income/expense. Blocks Next
       (via isMapStepValid) until the user adds them to a list above. -->
  <p
    v-if="importStore.uncoveredTransactionTypeValues.length"
    class="text-warning-text mt-2 text-xs font-medium"
    role="alert"
  >
    {{
      $t('pages.importExport.transactionTypeMapping.uncoveredValues', {
        values: importStore.uncoveredTransactionTypeValues.join(', '),
      })
    }}
  </p>
</template>

<script setup lang="ts">
import InputField from '@/components/fields/input-field.vue';
import { useImportExportStore } from '@/stores/import-export';
import { TransactionTypeOptionValue } from '@bt/shared/types';
import { computed } from 'vue';

import CellColumnSelect from './cell-column-select.vue';

const props = defineProps<{
  /** Headers already used by other fields — passed down so they're demoted in the column picker. */
  usedByOthers?: string[];
}>();

const importStore = useImportExportStore();

/** The current data-source-column option, or null when the method is amount-sign. */
const dataSourceOption = computed(() => {
  const option = importStore.columnMapping.transactionType;
  return option?.option === TransactionTypeOptionValue.dataSourceColumn ? option : null;
});

const columnName = computed<string | null>(() => dataSourceOption.value?.columnName || null);

const incomeValuesInput = computed<string>(() => (dataSourceOption.value?.incomeValues ?? []).join(', '));
const expenseValuesInput = computed<string>(() => (dataSourceOption.value?.expenseValues ?? []).join(', '));

/** Splits a comma-separated input into trimmed, non-empty tokens. */
const parseValues = (raw: string): string[] =>
  raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

const handleColumnChange = (column: string | null) => {
  const current = dataSourceOption.value;
  if (!current) return;
  importStore.columnMapping.transactionType = { ...current, columnName: column ?? '' };
};

const handleIncomeChange = (value: string | number | null) => {
  const current = dataSourceOption.value;
  if (!current) return;
  importStore.columnMapping.transactionType = { ...current, incomeValues: parseValues(String(value ?? '')) };
};

const handleExpenseChange = (value: string | number | null) => {
  const current = dataSourceOption.value;
  if (!current) return;
  importStore.columnMapping.transactionType = { ...current, expenseValues: parseValues(String(value ?? '')) };
};
</script>
