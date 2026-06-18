import {
  type AccountMappingConfig,
  type AccountOption,
  AccountOptionValue,
  type CategoryMappingConfig,
  type CategoryOption,
  CategoryOptionValue,
  type CurrencyOption,
  type DateColumnError,
  type DetectDuplicatesResponse,
  type DuplicateMatch,
  type ExecuteImportResponse,
  type InvalidRow,
  type ParsedTransactionRow,
  type SourceAccount,
  type TagMappingConfig,
  type TagOption,
  type TransactionTypeOption,
  TransactionTypeOptionValue,
} from '@bt/shared/types';

type UnpriceableRow = NonNullable<DetectDuplicatesResponse['unpriceableRows']>[number];
import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const/vue-query';
import { i18n } from '@/i18n';
import { useQueryClient } from '@tanstack/vue-query';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { useCategoriesStore } from './categories/categories';
import { useOnboardingStore } from './onboarding';
import { useTagsStore } from './tags';

interface ColumnMapping {
  date: string | null;
  amount: string | null;
  description: string | null;
  category: CategoryOption | null;
  tags: TagOption | null;
  account: AccountOption | null;
  currency: CurrencyOption | null;
  transactionType: TransactionTypeOption | null;
}

interface TransactionTypeMapping {
  method: TransactionTypeOptionValue;
  incomeValues: string[];
  expenseValues: string[];
}

export const useImportExportStore = defineStore('importExport', () => {
  const queryClient = useQueryClient();

  // Step 1: File upload
  const uploadedFile = ref<File | null>(null);
  const fileContent = ref<string | null>(null);

  // Step 2: Parsing
  const csvHeaders = ref<string[]>([]);
  const csvPreview = ref<Record<string, string>[]>([]);
  const detectedDelimiter = ref<string>(',');
  const totalRows = ref<number>(0);

  // Step 3: Column mapping
  const columnMapping = ref<ColumnMapping>({
    date: null,
    amount: null,
    description: null,
    category: null,
    tags: null,
    account: null,
    currency: null,
    transactionType: null,
  });
  const transactionTypeMapping = ref<TransactionTypeMapping>({
    method: TransactionTypeOptionValue.amountSign,
    incomeValues: [],
    expenseValues: [],
  });

  // Step 4: Account, Category, and Tag mapping (after extraction)
  const uniqueAccountsInCSV = ref<SourceAccount[]>([]);
  const accountMapping = ref<AccountMappingConfig>({});
  const uniqueCategoriesInCSV = ref<string[]>([]);
  const categoryMapping = ref<CategoryMappingConfig>({});
  const uniqueTagsInCSV = ref<string[]>([]);
  const tagMapping = ref<TagMappingConfig>({});

  // Currency mismatch warning from backend
  const currencyMismatchWarning = ref<string | null>(null);

  // Step 5: Duplicate detection results
  const validRows = ref<ParsedTransactionRow[]>([]);
  const invalidRows = ref<InvalidRow[]>([]);
  const duplicates = ref<DuplicateMatch[]>([]);
  const unmarkedDuplicateIndices = ref<Set<number>>(new Set());
  // Present when the date column has conflicting day/month order — blocks import until user fixes the CSV.
  const dateColumnError = ref<DateColumnError | null>(null);
  // Rows whose currency has no exchange rate; user must skip or abort before import proceeds.
  const unpriceableRows = ref<UnpriceableRow[]>([]);

  // Step 5b: Duplicate-detection async state.
  // Separate from dateColumnError (a *successful* response describing a data problem)
  // — this fires when the API call itself fails (network, 5xx, etc.).
  const isDetectingDuplicates = ref<boolean>(false);
  const detectError = ref<string | null>(null);

  // Step 6: Import execution
  const importInProgress = ref<boolean>(false);
  const importResult = ref<ExecuteImportResponse | null>(null);
  // Set when the execute-import API call itself fails (network, 5xx, validation).
  // A post-success refresh failure (loadCategories/loadTags) does NOT set this.
  const importError = ref<string | null>(null);

  // UI state
  const currentStep = ref<number>(1);
  const completedSteps = ref<number[]>([]);

  // Getters
  const canProceedToStep2 = computed(() => !!fileContent.value);

  const canProceedToStep3 = computed(() => {
    return !!(columnMapping.value.date && columnMapping.value.amount && columnMapping.value.currency);
  });

  const rowsToImport = computed(() => {
    // Get indices of duplicates that user hasn't unmarked (will be skipped)
    const duplicateIndicesToSkip = new Set(
      duplicates.value.filter((d) => !unmarkedDuplicateIndices.value.has(d.rowIndex)).map((d) => d.rowIndex),
    );

    return validRows.value.filter((row) => !duplicateIndicesToSkip.has(row.rowIndex));
  });

  const importSummary = computed(() => ({
    totalRows: totalRows.value,
    validRows: validRows.value.length,
    invalidRows: invalidRows.value.length,
    duplicates: duplicates.value.length - unmarkedDuplicateIndices.value.size,
    willImport: rowsToImport.value.length,
  }));

  // Actions
  const parseFile = async (file: File) => {
    uploadedFile.value = file;
    fileContent.value = await file.text();

    // Call backend API to parse CSV
    const { parseCsv } = await import('@/api/import-export');
    const response = await parseCsv({
      fileContent: fileContent.value,
    });

    csvHeaders.value = response.headers.filter((h) => h !== '');
    csvPreview.value = response.preview;
    detectedDelimiter.value = response.detectedDelimiter;
    totalRows.value = response.totalRows;

    currentStep.value = 2;
    completedSteps.value.push(1);
  };

  const detectDuplicates = async () => {
    const { detectDuplicates: detectDuplicatesApi } = await import('@/api/import-export');

    // Clear prior errors and unpriceable state before a fresh run — data-level
    // (dateColumnError, unpriceableRows) and transport-level (detectError) are
    // reset so stale messages don't linger.
    dateColumnError.value = null;
    unpriceableRows.value = [];
    detectError.value = null;
    isDetectingDuplicates.value = true;

    try {
      const response: DetectDuplicatesResponse = await detectDuplicatesApi({
        fileContent: fileContent.value!,
        delimiter: detectedDelimiter.value,
        columnMapping: {
          date: columnMapping.value.date!,
          amount: columnMapping.value.amount!,
          description: columnMapping.value.description || undefined,
          category: columnMapping.value.category!,
          tags: columnMapping.value.tags ?? undefined,
          account: columnMapping.value.account!,
          currency: columnMapping.value.currency!,
          transactionType: columnMapping.value.transactionType!,
        },
        accountMapping: accountMapping.value,
        categoryMapping: categoryMapping.value,
        tagMapping: tagMapping.value,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      validRows.value = response.validRows;
      invalidRows.value = response.invalidRows;
      duplicates.value = response.duplicates;
      unmarkedDuplicateIndices.value = new Set();
      unpriceableRows.value = response.unpriceableRows ?? [];

      if (response.dateColumnError) {
        // Date column has mixed day/month order — import is blocked; stay on mapping step.
        dateColumnError.value = response.dateColumnError;
        return;
      }

      currentStep.value = 3;
      if (!completedSteps.value.includes(2)) {
        completedSteps.value.push(2);
      }
    } catch (error) {
      // Surface the error message so the UI can render it; re-throw so callers
      // (e.g. handleContinue) can decide whether to show a global error boundary.
      detectError.value = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      isDetectingDuplicates.value = false;
    }
  };

  const toggleDuplicateUnmark = (rowIndex: number) => {
    if (unmarkedDuplicateIndices.value.has(rowIndex)) {
      unmarkedDuplicateIndices.value.delete(rowIndex);
    } else {
      unmarkedDuplicateIndices.value.add(rowIndex);
    }
  };

  const executeImport = async ({ skipUnpriceableIndices }: { skipUnpriceableIndices?: number[] } = {}) => {
    importInProgress.value = true;
    importError.value = null;

    try {
      const { executeImport: executeImportApi } = await import('@/api/import-export');

      // Calculate which duplicates should be skipped
      const skipDuplicateIndices = duplicates.value
        .filter((d) => !unmarkedDuplicateIndices.value.has(d.rowIndex))
        .map((d) => d.rowIndex);

      const accountOption = columnMapping.value.account;
      const defaultAccountId =
        accountOption?.option === AccountOptionValue.existingAccount ? accountOption.accountId : undefined;

      const categoryOption = columnMapping.value.category;
      const defaultCategoryId =
        categoryOption?.option === CategoryOptionValue.existingCategory ? categoryOption.categoryId : undefined;

      // Only send tagMapping when a tags column is actually mapped. When the user
      // deselects the tags column, tagMapping may still hold stale entries; sending
      // them would make the backend create tags the user opted out of. The backend
      // treats an omitted tagMapping as "no tags" (see execute-import service).
      const tagMappingPayload = columnMapping.value.tags ? tagMapping.value : undefined;

      const response = await executeImportApi({
        validRows: validRows.value,
        accountMapping: accountMapping.value,
        categoryMapping: categoryMapping.value,
        tagMapping: tagMappingPayload,
        skipDuplicateIndices,
        skipUnpriceableIndices,
        defaultAccountId,
        defaultCategoryId,
      });

      importResult.value = response;

      // Note: import_completed is tracked on the backend for reliability

      // Mark onboarding task as complete
      const onboardingStore = useOnboardingStore();
      onboardingStore.completeTask('import-csv');

      // Invalidate the query groups that an import can mutate.
      //
      // transactionChange prefix: covers all widgets, analytics, records lists,
      // allAccounts, accountGroups, balances, and everything else keyed on tx changes.
      queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });

      // currencies prefix: import can connect new user currencies (e.g. a row uses
      // EUR when only USD was active). Covers userCurrencies, allCurrencies, baseCurrency,
      // and exchange-rate-for-date queries in one shot.
      queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.currencies] });

      // categoriesByAccount has no shared prefix, so it must be invalidated explicitly.
      // Import can create new categories that would otherwise be missing from category pickers.
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.categoriesByAccount });

      // The Pinia categories store is not VueQuery-backed, so invalidateQueries alone won't
      // refresh it. Call loadCategories explicitly so newly-created categories appear in
      // category pickers and lists without a full page reload.
      //
      // The import already succeeded by this point, so a refresh failure must NOT surface
      // as an import error. Swallow and log it instead of letting it reject executeImport.
      if (response.summary.categoriesCreated > 0) {
        try {
          await useCategoriesStore().loadCategories();
        } catch (refreshError) {
          console.error('Failed to refresh categories after import', refreshError);
        }
      }

      // Same reasoning for tags: Pinia store is not VueQuery-backed, so newly-created
      // tags must be loaded explicitly to appear in tag pickers without a page reload.
      // Also guarded so a post-success refresh failure never fake-fails the import.
      if (response.summary.tagsCreated > 0) {
        try {
          await useTagsStore().loadTags();
        } catch (refreshError) {
          console.error('Failed to refresh tags after import', refreshError);
        }
      }

      currentStep.value = 4;
      if (!completedSteps.value.includes(3)) {
        completedSteps.value.push(3);
      }
    } catch (error) {
      // A genuine import-API failure: surface a user-readable message for the UI to render,
      // then re-throw so callers can react (their handlers absorb the rejection).
      importError.value = i18n.global.t('pages.importExport.csvImport.results.importFailed');
      throw error;
    } finally {
      importInProgress.value = false;
    }
  };

  const reset = () => {
    uploadedFile.value = null;
    fileContent.value = null;
    csvHeaders.value = [];
    csvPreview.value = [];
    detectedDelimiter.value = ',';
    totalRows.value = 0;
    columnMapping.value = {
      date: null,
      amount: null,
      description: null,
      category: null,
      tags: null,
      account: null,
      currency: null,
      transactionType: null,
    };
    transactionTypeMapping.value = {
      method: TransactionTypeOptionValue.amountSign,
      incomeValues: [],
      expenseValues: [],
    };
    uniqueAccountsInCSV.value = [];
    accountMapping.value = {};
    uniqueCategoriesInCSV.value = [];
    categoryMapping.value = {};
    uniqueTagsInCSV.value = [];
    tagMapping.value = {};
    currencyMismatchWarning.value = null;
    validRows.value = [];
    invalidRows.value = [];
    duplicates.value = [];
    unmarkedDuplicateIndices.value = new Set();
    dateColumnError.value = null;
    unpriceableRows.value = [];
    isDetectingDuplicates.value = false;
    detectError.value = null;
    importInProgress.value = false;
    importResult.value = null;
    importError.value = null;
    currentStep.value = 1;
    completedSteps.value = [];
  };

  return {
    // State
    uploadedFile,
    fileContent,
    csvHeaders,
    csvPreview,
    detectedDelimiter,
    totalRows,
    columnMapping,
    transactionTypeMapping,
    uniqueAccountsInCSV,
    accountMapping,
    uniqueCategoriesInCSV,
    categoryMapping,
    uniqueTagsInCSV,
    tagMapping,
    currencyMismatchWarning,
    validRows,
    invalidRows,
    duplicates,
    unmarkedDuplicateIndices,
    dateColumnError,
    unpriceableRows,
    isDetectingDuplicates,
    detectError,
    importInProgress,
    importResult,
    importError,
    currentStep,
    completedSteps,

    // Getters
    canProceedToStep2,
    canProceedToStep3,
    rowsToImport,
    importSummary,

    // Actions
    parseFile,
    detectDuplicates,
    toggleDuplicateUnmark,
    executeImport,
    reset,
  };
});
