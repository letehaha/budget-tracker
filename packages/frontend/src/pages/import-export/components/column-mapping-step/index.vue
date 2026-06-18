<template>
  <div class="bg-card rounded-lg border p-6">
    <div class="mb-4">
      <h2 class="text-lg font-semibold">{{ t('pages.importExport.csvImport.columnMapping.stepTitle') }}</h2>
      <p class="text-muted-foreground text-sm">
        {{ t('pages.importExport.csvImport.columnMapping.description') }}
      </p>
    </div>

    <!-- CSV Preview Summary -->
    <div class="bg-muted mb-6 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium">
            {{ t('pages.importExport.csvImport.columnMapping.file') }}: {{ importStore.uploadedFile?.name }}
          </p>
          <p class="text-muted-foreground text-xs">
            {{ t('pages.importExport.csvImport.columnMapping.totalRows') }}: {{ importStore.totalRows }}
            <span class="mx-1">|</span>
            {{ t('pages.importExport.csvImport.columnMapping.delimiter') }}: "{{ importStore.detectedDelimiter }}"
          </p>
        </div>
      </div>
    </div>

    <!-- Column Mapping -->
    <ColumnMappingDropdowns />

    <!-- Extract Values Button (shown before extraction) -->
    <div v-if="!hasExtracted" class="mt-6 flex justify-end">
      <UiButton @click="handleExtractValues" :disabled="!canExtract || isExtracting">
        <template v-if="isExtracting">{{ t('pages.importExport.csvImport.columnMapping.extracting') }}</template>
        <template v-else>
          {{ t('pages.importExport.csvImport.columnMapping.nextExtract') }}
          <ChevronRightIcon class="ml-2 size-4" />
        </template>
      </UiButton>
    </div>

    <!-- Currency Mismatch Warning -->
    <Callout v-if="importStore.currencyMismatchWarning" class="mt-4">
      <p>{{ importStore.currencyMismatchWarning }}</p>
    </Callout>

    <!-- Account Mapping Table (shown after extract is called) -->
    <AccountMappingTable v-if="importStore.uniqueAccountsInCSV.length > 0" class="mt-6" />

    <!-- Category Mapping Table (shown after extract is called) -->
    <CategoryMappingTable v-if="importStore.uniqueCategoriesInCSV.length > 0" class="mt-6" />

    <!-- Tag Mapping Table (shown after extract when a tags column was selected) -->
    <TagMappingTable v-if="importStore.uniqueTagsInCSV.length > 0" class="mt-6" />

    <Callout v-if="extractingError" variant="destructive" class="mt-4" role="alert">
      <p>{{ extractingError }}</p>
    </Callout>

    <!-- Date column has mixed day/month order — user must fix the CSV before continuing. -->
    <Callout v-if="importStore.dateColumnError" variant="destructive" class="mt-4" role="alert">
      <p>{{ importStore.dateColumnError.message }}</p>
    </Callout>

    <!-- Surfaced when detectDuplicates itself fails (network / 5xx), distinct from
         dateColumnError which is a successful-response data problem. -->
    <Callout v-if="importStore.detectError" variant="destructive" class="mt-4" role="alert">
      <p>{{ importStore.detectError }}</p>
    </Callout>

    <!-- Continue Button (shown after extraction) -->
    <div v-if="hasExtracted" class="mt-6 flex justify-end">
      <UiButton
        @click="handleContinue"
        :disabled="!canContinue || !!importStore.dateColumnError || importStore.isDetectingDuplicates"
      >
        <template v-if="importStore.isDetectingDuplicates">
          {{ t('pages.importExport.csvImport.columnMapping.detecting') }}
        </template>
        <template v-else>
          {{ t('pages.importExport.csvImport.columnMapping.continueToDuplicates') }}
          <ChevronRightIcon class="ml-2 size-4" />
        </template>
      </UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Callout } from '@/components/lib/ui/callout';
import { ApiErrorResponseError } from '@/js/errors';
import { useImportExportStore } from '@/stores/import-export';
import { API_ERROR_CODES, AccountOptionValue, CategoryOptionValue, TagOptionValue } from '@bt/shared/types';
import { ChevronRightIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import AccountMappingTable from './account-mapping-table.vue';
import CategoryMappingTable from './category-mapping-table.vue';
import ColumnMappingDropdowns from './column-mapping-dropdowns.vue';
import TagMappingTable from './tag-mapping-table.vue';

const { t } = useI18n();

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

  // If the user chose "map from CSV column" for tags, a column name must be selected
  // before the backend can locate and parse the tags column.
  if (
    importStore.columnMapping.tags?.option === TagOptionValue.mapDataSourceColumn &&
    !importStore.columnMapping.tags.columnName
  ) {
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

  // If a tags column is selected, every source tag must have a fully-resolved decision:
  // 'create-new' and 'skip' are complete as-is; 'link-existing' requires a tagId
  // so the backend knows which existing tag to attach.
  const tagsOption = importStore.columnMapping.tags;
  if (tagsOption && tagsOption.option === TagOptionValue.mapDataSourceColumn) {
    const allDecided = importStore.uniqueTagsInCSV.every((tag) => {
      const mapping = importStore.tagMapping[tag];
      return (
        mapping?.action === 'create-new' ||
        mapping?.action === 'skip' ||
        (mapping?.action === 'link-existing' && !!mapping.tagId)
      );
    });
    if (!allDecided) return false;
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
        tags: importStore.columnMapping.tags ?? undefined,
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

    // Store extracted tags and default every source tag to 'create-new'.
    // Users can override individual rows in the tag-mapping table.
    importStore.uniqueTagsInCSV = result.sourceTags;

    // Prune mappings for tags that are no longer present (e.g. after switching the
    // tags column), then default any newly-seen tag to 'create-new'. Pruning matters
    // because executeImport sends tagMapping verbatim — stale keys would create tags
    // the user no longer intends to import.
    const sourceTagSet = new Set(result.sourceTags);
    Object.keys(importStore.tagMapping).forEach((tag) => {
      if (!sourceTagSet.has(tag)) {
        delete importStore.tagMapping[tag];
      }
    });
    result.sourceTags.forEach((tag) => {
      if (!importStore.tagMapping[tag]) {
        importStore.tagMapping[tag] = { action: 'create-new' };
      }
    });

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
  try {
    // detectDuplicates advances to step 3 on success; stores detectError on failure.
    await importStore.detectDuplicates();
  } catch {
    // Error is already captured in importStore.detectError and rendered in the Callout above.
    // Absorb here so the click handler doesn't propagate an unhandled rejection.
  }
};
</script>
