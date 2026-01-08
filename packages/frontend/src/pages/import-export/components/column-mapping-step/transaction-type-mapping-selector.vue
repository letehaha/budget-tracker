<template>
  <div class="bg-muted/30 mt-6 rounded-lg border p-4">
    <h3 class="mb-4 text-sm font-semibold">
      {{ $t('pages.importExport.transactionTypeMapping.title') }} <span class="text-destructive-text">*</span>
    </h3>

    <!-- Method Selection -->
    <div class="mb-4">
      <SelectField
        :model-value="selectedMethodObject"
        :values="methodOptions"
        :label="$t('pages.importExport.transactionTypeMapping.methodLabel')"
        :placeholder="$t('pages.importExport.transactionTypeMapping.selectMethod')"
        @update:model-value="handleMethodChange"
      />
      <p class="text-muted-foreground mt-1 text-xs">
        {{ $t('pages.importExport.transactionTypeMapping.methodDescription') }}
      </p>
    </div>

    <!-- Column Selection + Value Inputs (if method is 'column') -->
    <div
      v-if="importStore.transactionTypeMapping.method === TransactionTypeOptionValue.dataSourceColumn"
      class="space-y-4"
    >
      <div>
        <SelectField
          :model-value="transactionTypeColumnObject"
          :values="columnOptions"
          :label="$t('pages.importExport.transactionTypeMapping.columnLabel')"
          :placeholder="$t('pages.importExport.transactionTypeMapping.selectColumn')"
          required
          @update:model-value="handleColumnChange"
        />
        <p class="text-muted-foreground mt-1 text-xs">
          {{ $t('pages.importExport.transactionTypeMapping.columnDescription') }}
        </p>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <label class="mb-2 block text-sm font-medium">
            {{ $t('pages.importExport.transactionTypeMapping.incomeValuesLabel') }}
            <span class="text-destructive-text">*</span>
          </label>
          <input
            v-model="incomeValuesInput"
            @blur="updateIncomeValues"
            type="text"
            :placeholder="$t('pages.importExport.transactionTypeMapping.incomeValuesPlaceholder')"
            class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p class="text-muted-foreground mt-1 text-xs">
            {{ $t('pages.importExport.transactionTypeMapping.commaSeparatedHint') }}
          </p>
        </div>

        <div>
          <label class="mb-2 block text-sm font-medium">
            {{ $t('pages.importExport.transactionTypeMapping.expenseValuesLabel') }}
            <span class="text-destructive-text">*</span>
          </label>
          <input
            v-model="expenseValuesInput"
            @blur="updateExpenseValues"
            type="text"
            :placeholder="$t('pages.importExport.transactionTypeMapping.expenseValuesPlaceholder')"
            class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p class="text-muted-foreground mt-1 text-xs">
            {{ $t('pages.importExport.transactionTypeMapping.commaSeparatedHint') }}
          </p>
        </div>
      </div>
    </div>

    <p
      v-if="importStore.transactionTypeMapping.method === TransactionTypeOptionValue.amountSign"
      class="bg-primary/10 border-primary mt-4 rounded-lg border p-3 text-sm"
    >
      {{ $t('pages.importExport.transactionTypeMapping.amountSignInfo') }}
    </p>
  </div>
</template>

<script setup lang="ts">
import SelectField from '@/components/fields/select-field.vue';
import { useImportExportStore } from '@/stores/import-export';
import { TransactionTypeOptionValue } from '@bt/shared/types';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

interface OptionItem {
  label: string;
  value: string;
}

const { t } = useI18n();
const importStore = useImportExportStore();

const incomeValuesInput = ref('');
const expenseValuesInput = ref('');

onMounted(() => {
  // Initialize input fields from store
  incomeValuesInput.value = importStore.transactionTypeMapping.incomeValues.join(', ');
  expenseValuesInput.value = importStore.transactionTypeMapping.expenseValues.join(', ');
});

const methodOptions = computed<OptionItem[]>(() => [
  {
    label: t('pages.importExport.transactionTypeMapping.methodOptions.amountSign'),
    value: TransactionTypeOptionValue.amountSign,
  },
  {
    label: t('pages.importExport.transactionTypeMapping.methodOptions.dataSourceColumn'),
    value: TransactionTypeOptionValue.dataSourceColumn,
  },
]);

const columnOptions = computed<OptionItem[]>(() =>
  importStore.csvHeaders.map((header) => ({
    label: header,
    value: header,
  })),
);

const selectedMethod = computed(() => importStore.transactionTypeMapping.method);

const selectedMethodObject = computed(() => {
  if (!selectedMethod.value) return null;
  return methodOptions.value.find((opt) => opt.value === selectedMethod.value) ?? null;
});

const transactionTypeColumn = computed(() => {
  const transactionType = importStore.columnMapping.transactionType;
  if (transactionType && transactionType.option === TransactionTypeOptionValue.dataSourceColumn) {
    return transactionType.columnName;
  }
  return null;
});

const transactionTypeColumnObject = computed(() => {
  if (!transactionTypeColumn.value) return null;
  return columnOptions.value.find((opt) => opt.value === transactionTypeColumn.value) ?? null;
});

const handleMethodChange = (option: OptionItem | null) => {
  if (!option) return;

  importStore.transactionTypeMapping.method = option.value as TransactionTypeOptionValue;

  // Reset transaction type column and values when switching to amount sign method
  if (option.value === TransactionTypeOptionValue.amountSign) {
    importStore.columnMapping.transactionType = { option: TransactionTypeOptionValue.amountSign };
    importStore.transactionTypeMapping.incomeValues = [];
    importStore.transactionTypeMapping.expenseValues = [];
    incomeValuesInput.value = '';
    expenseValuesInput.value = '';
  } else if (option.value === TransactionTypeOptionValue.dataSourceColumn) {
    importStore.columnMapping.transactionType = {
      option: TransactionTypeOptionValue.dataSourceColumn,
      columnName: '',
      incomeValues: [],
      expenseValues: [],
    };
  }
};

const handleColumnChange = (column: OptionItem | null) => {
  const currentOption = importStore.columnMapping.transactionType;

  if (column && currentOption && currentOption.option === TransactionTypeOptionValue.dataSourceColumn) {
    importStore.columnMapping.transactionType = {
      option: TransactionTypeOptionValue.dataSourceColumn,
      columnName: column.value,
      incomeValues: currentOption.incomeValues,
      expenseValues: currentOption.expenseValues,
    };
  }
};

const updateIncomeValues = () => {
  const values = incomeValuesInput.value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  importStore.transactionTypeMapping.incomeValues = values;

  // Also update columnMapping.transactionType if it's in dataSourceColumn mode
  const currentOption = importStore.columnMapping.transactionType;
  if (currentOption && currentOption.option === TransactionTypeOptionValue.dataSourceColumn) {
    importStore.columnMapping.transactionType = {
      option: TransactionTypeOptionValue.dataSourceColumn,
      columnName: currentOption.columnName,
      incomeValues: values,
      expenseValues: currentOption.expenseValues,
    };
  }
};

const updateExpenseValues = () => {
  const values = expenseValuesInput.value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  importStore.transactionTypeMapping.expenseValues = values;

  // Also update columnMapping.transactionType if it's in dataSourceColumn mode
  const currentOption = importStore.columnMapping.transactionType;
  if (currentOption && currentOption.option === TransactionTypeOptionValue.dataSourceColumn) {
    importStore.columnMapping.transactionType = {
      option: TransactionTypeOptionValue.dataSourceColumn,
      columnName: currentOption.columnName,
      incomeValues: currentOption.incomeValues,
      expenseValues: values,
    };
  }
};
</script>
