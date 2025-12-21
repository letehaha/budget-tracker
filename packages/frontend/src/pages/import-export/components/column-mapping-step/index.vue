<template>
  <div class="bg-card rounded-lg border p-6">
    <div class="mb-4">
      <h2 class="text-lg font-semibold">Step 2: Map Columns</h2>
      <p class="text-muted-foreground text-sm">
        Match your CSV columns to MoneyMatter fields. Preview shown below with first 10 rows.
      </p>
    </div>

    <!-- CSV Preview Summary -->
    <div class="bg-muted mb-6 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium">File: {{ importStore.uploadedFile?.name }}</p>
          <p class="text-muted-foreground text-xs">
            Total rows: {{ importStore.totalRows }} | Delimiter: "{{ importStore.detectedDelimiter }}"
          </p>
        </div>
      </div>
    </div>

    <!-- Column Mapping -->
    <ColumnMappingDropdowns />

    <!-- Extract Values Button (shown before extraction) -->
    <div v-if="!hasExtracted" class="mt-6 flex justify-end">
      <UiButton @click="handleExtractValues" :disabled="!canExtract || isExtracting">
        <template v-if="isExtracting"> Extracting values from full dataset... </template>
        <template v-else>
          Next: Extract & Map Values
          <ChevronRightIcon class="ml-2 size-4" />
        </template>
      </UiButton>
    </div>

    <!-- Currency Mismatch Warning -->
    <div v-if="importStore.currencyMismatchWarning" class="bg-warning/20 border-warning mt-4 rounded-lg border p-4">
      <p class="text-warning-foreground text-sm">⚠️ {{ importStore.currencyMismatchWarning }}</p>
    </div>

    <!-- Account Mapping Table (shown after extract is called) -->
    <AccountMappingTable v-if="importStore.uniqueAccountsInCSV.length > 0" class="mt-6" />

    <!-- Category Mapping Table (shown after extract is called) -->
    <CategoryMappingTable v-if="importStore.uniqueCategoriesInCSV.length > 0" class="mt-6" />

    <template v-if="extractingError">
      <div class="bg-destructive/20 border-destructive mt-4 rounded-lg border p-4">
        <p class="text-destructive-text">
          {{ extractingError }}
        </p>
      </div>
    </template>

    <!-- Continue Button (shown after extraction) -->
    <div v-if="hasExtracted" class="mt-6 flex justify-end">
      <UiButton @click="handleContinue" :disabled="!canContinue">
        Continue to Duplicate Detection
        <ChevronRightIcon class="ml-2 size-4" />
      </UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import UiButton from '@/components/lib/ui/button/Button.vue';
import { ApiErrorResponseError } from '@/js/errors';
import { useImportExportStore } from '@/stores/import-export';
import { API_ERROR_CODES, AccountOptionValue, CategoryOptionValue } from '@bt/shared/types';
import { ChevronRightIcon } from 'lucide-vue-next';
import { computed, ref } from 'vue';

import AccountMappingTable from './account-mapping-table.vue';
import CategoryMappingTable from './category-mapping-table.vue';
import ColumnMappingDropdowns from './column-mapping-dropdowns.vue';

const importStore = useImportExportStore();

const extractingError = ref<string | undefined>(undefined);
const isExtracting = ref(false);
const hasExtracted = ref(false);

const canExtract = computed(() => {
  // Required fields
  if (!importStore.columnMapping.date || !importStore.columnMapping.amount) {
    return false;
  }

  // Currency required
  if (!importStore.columnMapping.currency) {
    return false;
  }

  // Account required
  if (!importStore.columnMapping.account) {
    return false;
  }

  // Category required
  if (!importStore.columnMapping.category) {
    return false;
  }

  // Transaction type required
  if (!importStore.columnMapping.transactionType) {
    return false;
  }

  return true;
});

const canContinue = computed(() => {
  // Must have extracted values first
  if (!hasExtracted.value) {
    return false;
  }

  // If account column selected, all accounts must be mapped to a valid target
  const accountOption = importStore.columnMapping.account;
  if (accountOption && accountOption.option === AccountOptionValue.dataSourceColumn) {
    const allMapped = importStore.uniqueAccountsInCSV.every((account) => {
      const mapping = importStore.accountMapping[account.name];
      return mapping?.action === 'create-new' || mapping?.action === 'link-existing';
    });
    if (!allMapped) return false;
  }

  // If category column selected with mapping options, all categories must be mapped
  const categoryOption = importStore.columnMapping.category;
  if (categoryOption && categoryOption.option === CategoryOptionValue.mapDataSourceColumn) {
    const allMapped = importStore.uniqueCategoriesInCSV.every((category) => {
      const mapping = importStore.categoryMapping[category];
      return mapping?.action === 'create-new' || mapping?.action === 'link-existing';
    });
    if (!allMapped) return false;
  }

  return true;
});

const handleExtractValues = async () => {
  isExtracting.value = true;
  extractingError.value = undefined;

  try {
    // Call backend to extract unique values from full dataset
    const { extractUniqueValues } = await import('@/api/import-export');

    const result = await extractUniqueValues({
      fileContent: importStore.fileContent!,
      delimiter: importStore.detectedDelimiter,
      columnMapping: {
        date: importStore.columnMapping.date!,
        amount: importStore.columnMapping.amount!,
        description: importStore.columnMapping.description || undefined,
        category: importStore.columnMapping.category!,
        account: importStore.columnMapping.account!,
        currency: importStore.columnMapping.currency!,
        transactionType: importStore.columnMapping.transactionType!,
      },
    });

    // Update store with extracted values
    importStore.uniqueAccountsInCSV = result.sourceAccounts;
    importStore.uniqueCategoriesInCSV = result.sourceCategories;
    importStore.currencyMismatchWarning = result.currencyMismatchWarning || null;

    // Auto-populate category mapping for "create-new-categories" option
    if (importStore.columnMapping.category?.option === CategoryOptionValue.createNewCategories) {
      result.sourceCategories.forEach((category) => {
        importStore.categoryMapping[category] = { action: 'create-new' };
      });
    }

    hasExtracted.value = true;
  } catch (error) {
    if (error instanceof ApiErrorResponseError) {
      if (error.data.code === API_ERROR_CODES.validationError || error.data.code === API_ERROR_CODES.notFound) {
        extractingError.value = error.data.message;
        return;
      }
    }
    throw error;
  } finally {
    isExtracting.value = false;
  }
};

const handleContinue = async () => {
  // Call detectDuplicates which will move to step 3
  await importStore.detectDuplicates();
};
</script>
