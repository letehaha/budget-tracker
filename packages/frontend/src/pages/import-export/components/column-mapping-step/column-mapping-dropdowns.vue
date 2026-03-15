<template>
  <div class="grid gap-4 md:grid-cols-2">
    <SelectField
      :model-value="dateColumnObject"
      :values="columnOptions"
      label="Date Column"
      :placeholder="$t('pages.importExport.common.selectColumn')"
      required
      @update:model-value="handleDateChange"
    />

    <SelectField
      :model-value="amountColumnObject"
      :values="columnOptions"
      label="Amount Column"
      :placeholder="$t('pages.importExport.common.selectColumn')"
      required
      @update:model-value="handleAmountChange"
    />

    <SelectField
      :model-value="descriptionColumnObject"
      :values="columnOptions"
      label="Description Column"
      :placeholder="$t('pages.importExport.common.noneOptional')"
      @update:model-value="handleDescriptionChange"
    />
  </div>

  <!-- Category Assignment -->
  <CategorySelector />

  <!-- Account Assignment -->
  <AccountAssignmentSelector />

  <!-- Currency Mapping -->
  <CurrencyMappingSelector />

  <!-- Transaction Type Mapping -->
  <TransactionTypeMappingSelector />
</template>

<script setup lang="ts">
import SelectField from '@/components/fields/select-field.vue';
import { useImportExportStore } from '@/stores/import-export';
import { computed } from 'vue';

import AccountAssignmentSelector from './account-assignment-selector.vue';
import CategorySelector from './category-selector.vue';
import CurrencyMappingSelector from './currency-mapping-selector.vue';
import TransactionTypeMappingSelector from './transaction-type-mapping-selector.vue';

interface OptionItem {
  label: string;
  value: string;
}
const importStore = useImportExportStore();

const columnOptions = computed<OptionItem[]>(() =>
  importStore.csvHeaders.map((header) => ({
    label: header,
    value: header,
  })),
);

const dateColumnObject = computed(() => {
  if (!importStore.columnMapping.date) return null;
  return columnOptions.value.find((opt) => opt.value === importStore.columnMapping.date) ?? null;
});

const amountColumnObject = computed(() => {
  if (!importStore.columnMapping.amount) return null;
  return columnOptions.value.find((opt) => opt.value === importStore.columnMapping.amount) ?? null;
});

const descriptionColumnObject = computed(() => {
  if (!importStore.columnMapping.description) return null;
  return columnOptions.value.find((opt) => opt.value === importStore.columnMapping.description) ?? null;
});

const handleDateChange = (option: OptionItem | null) => {
  importStore.columnMapping.date = option ? option.value : null;
};

const handleAmountChange = (option: OptionItem | null) => {
  importStore.columnMapping.amount = option ? option.value : null;
};

const handleDescriptionChange = (option: OptionItem | null) => {
  importStore.columnMapping.description = option ? option.value : null;
};
</script>
