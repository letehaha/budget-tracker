import { trackAnalyticsEvent } from '@/lib/posthog';
import {
  type AccountMappingConfig,
  type AccountOption,
  type CategoryMappingConfig,
  type CategoryOption,
  type CurrencyOption,
  type DetectDuplicatesResponse,
  type DuplicateMatch,
  type ExecuteImportResponse,
  type InvalidRow,
  type ParsedTransactionRow,
  type SourceAccount,
  type TransactionTypeOption,
  TransactionTypeOptionValue,
} from '@bt/shared/types';
import { useQueryClient } from '@tanstack/vue-query';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

interface ColumnMapping {
  date: string | null;
  amount: string | null;
  description: string | null;
  category: CategoryOption | null;
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
    account: null,
    currency: null,
    transactionType: null,
  });
  const transactionTypeMapping = ref<TransactionTypeMapping>({
    method: TransactionTypeOptionValue.amountSign,
    incomeValues: [],
    expenseValues: [],
  });

  // Step 4: Account & Category mapping (after extraction)
  const uniqueAccountsInCSV = ref<SourceAccount[]>([]);
  const accountMapping = ref<AccountMappingConfig>({});
  const uniqueCategoriesInCSV = ref<string[]>([]);
  const categoryMapping = ref<CategoryMappingConfig>({});

  // Currency mismatch warning from backend
  const currencyMismatchWarning = ref<string | null>(null);

  // Step 5: Duplicate detection results
  const validRows = ref<ParsedTransactionRow[]>([]);
  const invalidRows = ref<InvalidRow[]>([]);
  const duplicates = ref<DuplicateMatch[]>([]);
  const unmarkedDuplicateIndices = ref<Set<number>>(new Set());

  // Step 6: Import execution
  const importInProgress = ref<boolean>(false);
  const importResult = ref<ExecuteImportResponse | null>(null);

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

    csvHeaders.value = response.headers;
    csvPreview.value = response.preview;
    detectedDelimiter.value = response.detectedDelimiter;
    totalRows.value = response.totalRows;

    currentStep.value = 2;
    completedSteps.value.push(1);
  };

  const detectDuplicates = async () => {
    const { detectDuplicates: detectDuplicatesApi } = await import('@/api/import-export');

    const response: DetectDuplicatesResponse = await detectDuplicatesApi({
      fileContent: fileContent.value!,
      delimiter: detectedDelimiter.value,
      columnMapping: {
        date: columnMapping.value.date!,
        amount: columnMapping.value.amount!,
        description: columnMapping.value.description || undefined,
        category: columnMapping.value.category!,
        account: columnMapping.value.account!,
        currency: columnMapping.value.currency!,
        transactionType: columnMapping.value.transactionType!,
      },
      accountMapping: accountMapping.value,
      categoryMapping: categoryMapping.value,
    });

    validRows.value = response.validRows;
    invalidRows.value = response.invalidRows;
    duplicates.value = response.duplicates;
    unmarkedDuplicateIndices.value = new Set();

    currentStep.value = 3;
    if (!completedSteps.value.includes(2)) {
      completedSteps.value.push(2);
    }
  };

  const toggleDuplicateUnmark = (rowIndex: number) => {
    if (unmarkedDuplicateIndices.value.has(rowIndex)) {
      unmarkedDuplicateIndices.value.delete(rowIndex);
    } else {
      unmarkedDuplicateIndices.value.add(rowIndex);
    }
  };

  const executeImport = async () => {
    importInProgress.value = true;

    try {
      const { executeImport: executeImportApi } = await import('@/api/import-export');

      // Calculate which duplicates should be skipped
      const skipDuplicateIndices = duplicates.value
        .filter((d) => !unmarkedDuplicateIndices.value.has(d.rowIndex))
        .map((d) => d.rowIndex);

      const response = await executeImportApi({
        validRows: validRows.value,
        accountMapping: accountMapping.value,
        categoryMapping: categoryMapping.value,
        skipDuplicateIndices,
      });

      importResult.value = response;

      trackAnalyticsEvent({
        event: 'import_completed',
        properties: { import_type: 'csv', transactions_count: response.summary.imported },
      });

      // Invalidate all queries to refetch data after import
      // Import can affect transactions, accounts, categories, currencies, and balances
      queryClient.invalidateQueries();

      currentStep.value = 4;
      if (!completedSteps.value.includes(3)) {
        completedSteps.value.push(3);
      }
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
    currencyMismatchWarning.value = null;
    validRows.value = [];
    invalidRows.value = [];
    duplicates.value = [];
    unmarkedDuplicateIndices.value = new Set();
    importInProgress.value = false;
    importResult.value = null;
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
    currencyMismatchWarning,
    validRows,
    invalidRows,
    duplicates,
    unmarkedDuplicateIndices,
    importInProgress,
    importResult,
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
