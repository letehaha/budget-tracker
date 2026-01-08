<template>
  <div class="bg-muted/30 mt-6 rounded-lg border p-4">
    <h3 class="mb-4 text-sm font-semibold">
      {{ $t('pages.importExport.currencyMapping.title') }} <span class="text-destructive-text">*</span>
    </h3>

    <!-- Option Selection -->
    <div class="mb-4">
      <SelectField
        :model-value="selectedOptionObject"
        :values="currencyOptions"
        :label="$t('pages.importExport.currencyMapping.optionLabel')"
        :placeholder="$t('pages.importExport.common.selectOption')"
        @update:model-value="handleOptionChange"
      />
      <p class="text-muted-foreground mt-1 text-xs">
        {{ $t('pages.importExport.currencyMapping.optionDescription') }}
      </p>
    </div>

    <!-- Column Selection (for data-source-column) -->
    <div v-if="selectedOption === CurrencyOptionValue.dataSourceColumn">
      <SelectField
        :model-value="currencyColumnObject"
        :values="columnOptions"
        :label="$t('pages.importExport.currencyMapping.columnLabel')"
        :placeholder="$t('pages.importExport.common.selectColumn')"
        @update:model-value="handleColumnChange"
      />
      <p class="text-muted-foreground mt-1 text-xs">
        {{ $t('pages.importExport.currencyMapping.columnDescription') }}
      </p>
    </div>

    <!-- Currency Selection (if existing-currency) -->
    <div v-if="selectedOption === CurrencyOptionValue.existingCurrency">
      <SelectField
        :model-value="selectedCurrency"
        :values="currencies"
        :label="$t('pages.importExport.currencyMapping.currencyLabel')"
        label-key="displayName"
        value-key="code"
        :placeholder="$t('pages.importExport.currencyMapping.selectCurrency')"
        with-search
        :search-keys="['code', 'currency']"
        @update:model-value="handleCurrencySelect"
      />
      <p class="text-muted-foreground mt-1 text-xs">
        {{ $t('pages.importExport.currencyMapping.currencyDescription') }}
      </p>
    </div>

    <p
      v-if="selectedOption === CurrencyOptionValue.dataSourceColumn"
      class="bg-primary/10 border-primary mt-4 rounded-lg border p-3 text-sm"
    >
      {{ $t('pages.importExport.currencyMapping.dataSourceColumnInfo') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { getAllCurrencies } from '@/api/currencies';
import SelectField from '@/components/fields/select-field.vue';
import { useImportExportStore } from '@/stores/import-export';
import { CurrencyModel, CurrencyOptionValue } from '@bt/shared/types';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

interface OptionItem {
  label: string;
  value: string;
}

interface CurrencyWithDisplay extends CurrencyModel {
  displayName: string;
}

const { t } = useI18n();
const importStore = useImportExportStore();
const currencies = ref<CurrencyWithDisplay[]>([]);

onMounted(async () => {
  const allCurrencies = await getAllCurrencies();
  currencies.value = allCurrencies.map((currency) => ({
    ...currency,
    displayName: `${currency.code} - ${currency.currency}`,
  }));
});

const currencyOptions = computed<OptionItem[]>(() => [
  {
    label: t('pages.importExport.currencyMapping.methodOptions.dataSourceColumn'),
    value: CurrencyOptionValue.dataSourceColumn,
  },
  {
    label: t('pages.importExport.currencyMapping.methodOptions.existingCurrency'),
    value: CurrencyOptionValue.existingCurrency,
  },
]);

const columnOptions = computed<OptionItem[]>(() =>
  importStore.csvHeaders.map((header) => ({
    label: header,
    value: header,
  })),
);

const selectedOption = computed(() => {
  if (!importStore.columnMapping.currency) return '';
  return importStore.columnMapping.currency.option;
});

const selectedOptionObject = computed(() => {
  if (!selectedOption.value) return null;
  return currencyOptions.value.find((opt) => opt.value === selectedOption.value) ?? null;
});

const currencyColumn = computed(() => {
  const curr = importStore.columnMapping.currency;
  if (curr && curr.option === CurrencyOptionValue.dataSourceColumn) {
    return curr.columnName;
  }
  return null;
});

const currencyColumnObject = computed(() => {
  if (!currencyColumn.value) return null;
  return columnOptions.value.find((opt) => opt.value === currencyColumn.value) ?? null;
});

const selectedCurrency = computed<CurrencyWithDisplay | null>(() => {
  const curr = importStore.columnMapping.currency;
  if (curr && curr.option === CurrencyOptionValue.existingCurrency) {
    return currencies.value.find((c) => c.code === curr.currencyCode) ?? null;
  }
  return null;
});

const handleOptionChange = (option: OptionItem | null) => {
  if (!option) {
    importStore.columnMapping.currency = null;
    return;
  }

  switch (option.value) {
    case CurrencyOptionValue.dataSourceColumn:
      importStore.columnMapping.currency = { option: CurrencyOptionValue.dataSourceColumn, columnName: '' };
      break;
    case CurrencyOptionValue.existingCurrency:
      importStore.columnMapping.currency = { option: CurrencyOptionValue.existingCurrency, currencyCode: '' };
      break;
  }
};

const handleColumnChange = (column: OptionItem | null) => {
  const currentOption = importStore.columnMapping.currency;

  if (column && currentOption && currentOption.option === CurrencyOptionValue.dataSourceColumn) {
    importStore.columnMapping.currency = { option: CurrencyOptionValue.dataSourceColumn, columnName: column.value };
  }
};

const handleCurrencySelect = (currency: CurrencyWithDisplay | null) => {
  if (currency) {
    importStore.columnMapping.currency = { option: CurrencyOptionValue.existingCurrency, currencyCode: currency.code };
  }
};
</script>
