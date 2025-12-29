import {
  type StatementCostEstimateFailure,
  type StatementDetectDuplicatesResponse,
  type StatementExecuteImportResponse,
  detectStatementDuplicates,
  estimateStatementCost,
  executeStatementImport,
  extractStatementTransactions,
} from '@/api/import-export';
import { loadTransactions } from '@/api/transactions';
import type { AccountModel, StatementCostEstimate, StatementExtractionResult } from '@bt/shared/types';
import type { TransactionModel } from '@bt/shared/types/db-models';
import { useQueryClient } from '@tanstack/vue-query';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

/**
 * Statement Parser Store
 *
 * Manages the multi-step flow for importing transactions from bank statements:
 * 1. Upload & Estimate - Upload file and get cost estimate
 * 2. Extract - AI extraction of transactions
 * 3. Account Selection - Select existing or create new account
 * 4. Review Duplicates - (only for existing accounts) Review and exclude duplicates
 * 5. Import - Execute import and show results
 */
export const useStatementParserStore = defineStore('statementParser', () => {
  const queryClient = useQueryClient();

  // Step tracking
  const currentStep = ref<number>(1);
  const completedSteps = ref<number[]>([]);

  // Step 1: File upload
  const uploadedFile = ref<File | null>(null);
  const fileBase64 = ref<string | null>(null);

  // Step 2: Cost estimate
  const isEstimating = ref(false);
  const costEstimate = ref<StatementCostEstimate | null>(null);
  const estimateError = ref<string | null>(null);

  // Step 3: Extraction
  const isExtracting = ref(false);
  const extractionResult = ref<StatementExtractionResult | null>(null);
  const extractionError = ref<string | null>(null);

  // Step 4: Account selection
  const selectedAccount = ref<AccountModel | null>(null);
  const isNewAccount = ref(false);
  // Manual currency selection (used when AI doesn't detect currency)
  const manualCurrency = ref<string | null>(null);

  // Step 5: Duplicate detection
  const isDetectingDuplicates = ref(false);
  const duplicates = ref<StatementDetectDuplicatesResponse['duplicates']>([]);
  // Existing transactions in the account within the statement date range
  const existingTransactions = ref<TransactionModel[]>([]);
  // Set of transaction indices that user wants to import anyway (override duplicate detection)
  const overriddenDuplicateIndices = ref<Set<number>>(new Set());
  // Set of transaction indices that user wants to exclude (manual exclusion)
  const excludedTransactionIndices = ref<Set<number>>(new Set());

  // Step 6: Import execution
  const isImporting = ref(false);
  const importResult = ref<StatementExecuteImportResponse | null>(null);
  const importError = ref<string | null>(null);

  // Computed properties
  const detectedCurrency = computed(() => extractionResult.value?.metadata.currencyCode);

  /**
   * Effective currency - either AI-detected or manually selected by user
   */
  const effectiveCurrency = computed(() => detectedCurrency.value || manualCurrency.value);

  /**
   * Get the date range of extracted transactions for fetching existing transactions
   */
  const extractedDateRange = computed(() => {
    if (!extractionResult.value?.transactions.length) return null;

    const dates = extractionResult.value.transactions.map((tx) => tx.date.split(' ')[0]!);
    const sortedDates = [...dates].sort();

    return {
      startDate: sortedDates[0]!,
      endDate: sortedDates[sortedDates.length - 1]!,
    };
  });

  const duplicateIndices = computed(() => new Set(duplicates.value.map((d) => d.transactionIndex)));

  /**
   * Transactions that will be imported (excluding duplicates and manually excluded)
   */
  const transactionsToImport = computed(() => {
    if (!extractionResult.value) return [];

    return extractionResult.value.transactions.filter((_, index) => {
      // Exclude if manually excluded
      if (excludedTransactionIndices.value.has(index)) return false;

      // Include if duplicate but overridden
      if (duplicateIndices.value.has(index) && overriddenDuplicateIndices.value.has(index)) return true;

      // Exclude if duplicate and not overridden
      if (duplicateIndices.value.has(index)) return false;

      return true;
    });
  });

  /**
   * Get indices of transactions to skip during import
   */
  const skipIndices = computed(() => {
    const indices: number[] = [];
    if (!extractionResult.value) return indices;

    extractionResult.value.transactions.forEach((_, index) => {
      // Skip if manually excluded
      if (excludedTransactionIndices.value.has(index)) {
        indices.push(index);
        return;
      }

      // Skip if duplicate and not overridden
      if (duplicateIndices.value.has(index) && !overriddenDuplicateIndices.value.has(index)) {
        indices.push(index);
      }
    });

    return indices;
  });

  const importSummary = computed(() => ({
    total: extractionResult.value?.transactions.length ?? 0,
    toImport: transactionsToImport.value.length,
    duplicates: duplicates.value.length,
    excluded: excludedTransactionIndices.value.size,
    overridden: overriddenDuplicateIndices.value.size,
  }));

  // Actions
  async function setFile({ file }: { file: File }) {
    uploadedFile.value = file;

    // Read file as base64
    return new Promise<void>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (data:application/pdf;base64,)
        fileBase64.value = result.split(',')[1] || result;
        resolve();
      };
      reader.readAsDataURL(file);
    });
  }

  async function estimateCost() {
    if (!fileBase64.value) return;

    isEstimating.value = true;
    estimateError.value = null;
    costEstimate.value = null;

    try {
      const result = await estimateStatementCost({ fileBase64: fileBase64.value });

      if ('success' in result && (result as StatementCostEstimateFailure).success === false) {
        const failure = result as StatementCostEstimateFailure;
        estimateError.value = failure.error?.message || failure.suggestion || 'Failed to analyze file';
      } else {
        costEstimate.value = result as StatementCostEstimate;
      }
    } catch (error) {
      estimateError.value = error instanceof Error ? error.message : 'Failed to estimate cost';
    } finally {
      isEstimating.value = false;
    }
  }

  async function extract() {
    if (!fileBase64.value) return;

    isExtracting.value = true;
    extractionError.value = null;
    extractionResult.value = null;

    try {
      const result = await extractStatementTransactions({ fileBase64: fileBase64.value });
      extractionResult.value = result;

      // Mark step 1 as completed and move to step 2 (account selection)
      if (!completedSteps.value.includes(1)) {
        completedSteps.value.push(1);
      }
      currentStep.value = 2;
    } catch (error) {
      extractionError.value = error instanceof Error ? error.message : 'Failed to extract transactions';
    } finally {
      isExtracting.value = false;
    }
  }

  function selectAccount({ account, isNew = false }: { account: AccountModel; isNew?: boolean }) {
    selectedAccount.value = account;
    isNewAccount.value = isNew;

    // Reset duplicate detection when account changes
    duplicates.value = [];
    overriddenDuplicateIndices.value = new Set();
  }

  function setManualCurrency({ currencyCode }: { currencyCode: string | null }) {
    manualCurrency.value = currencyCode;
  }

  function clearSelectedAccount() {
    selectedAccount.value = null;
    isNewAccount.value = false;
    duplicates.value = [];
    overriddenDuplicateIndices.value = new Set();
  }

  async function proceedFromAccountSelection() {
    if (!selectedAccount.value || !extractionResult.value) return;

    // Mark account selection step as completed
    if (!completedSteps.value.includes(2)) {
      completedSteps.value.push(2);
    }

    if (isNewAccount.value) {
      // Skip duplicate detection for new accounts - go directly to import
      currentStep.value = 4;
      if (!completedSteps.value.includes(3)) {
        completedSteps.value.push(3);
      }
    } else {
      // Detect duplicates for existing accounts
      currentStep.value = 3;
      await detectDuplicates();
    }
  }

  async function detectDuplicates() {
    if (!selectedAccount.value || !extractionResult.value) return;

    isDetectingDuplicates.value = true;
    duplicates.value = [];
    existingTransactions.value = [];

    try {
      // Fetch duplicates and existing transactions in parallel
      const duplicatesPromise = detectStatementDuplicates({
        accountId: selectedAccount.value.id,
        transactions: extractionResult.value.transactions,
      });

      // Fetch existing transactions for the date range
      const dateRange = extractedDateRange.value;
      const existingPromise = dateRange
        ? loadTransactions({
            from: 0,
            limit: 1000, // Reasonable limit for a statement period
            accountIds: [selectedAccount.value.id],
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
          })
        : Promise.resolve([]);

      const [duplicatesResult, existingResult] = await Promise.all([duplicatesPromise, existingPromise]);

      duplicates.value = duplicatesResult.duplicates;
      existingTransactions.value = existingResult;

      // Mark duplicate review step as completed
      if (!completedSteps.value.includes(3)) {
        completedSteps.value.push(3);
      }
    } catch (error) {
      console.error('Failed to detect duplicates:', error);
      // Continue anyway - duplicates detection is not critical
    } finally {
      isDetectingDuplicates.value = false;
    }
  }

  function toggleDuplicateOverride({ transactionIndex }: { transactionIndex: number }) {
    if (overriddenDuplicateIndices.value.has(transactionIndex)) {
      overriddenDuplicateIndices.value.delete(transactionIndex);
    } else {
      overriddenDuplicateIndices.value.add(transactionIndex);
    }
    // Trigger reactivity
    overriddenDuplicateIndices.value = new Set(overriddenDuplicateIndices.value);
  }

  function toggleTransactionExclusion({ transactionIndex }: { transactionIndex: number }) {
    if (excludedTransactionIndices.value.has(transactionIndex)) {
      excludedTransactionIndices.value.delete(transactionIndex);
    } else {
      excludedTransactionIndices.value.add(transactionIndex);
    }
    // Trigger reactivity
    excludedTransactionIndices.value = new Set(excludedTransactionIndices.value);
  }

  function proceedToImport() {
    currentStep.value = 4;
  }

  async function executeImport() {
    if (!selectedAccount.value || !extractionResult.value) return;

    isImporting.value = true;
    importError.value = null;
    importResult.value = null;

    try {
      const result = await executeStatementImport({
        accountId: selectedAccount.value.id,
        transactions: extractionResult.value.transactions,
        skipIndices: skipIndices.value,
      });
      importResult.value = result;

      // Invalidate all queries to refetch data after import
      queryClient.invalidateQueries();

      // Mark import step as completed
      if (!completedSteps.value.includes(4)) {
        completedSteps.value.push(4);
      }
    } catch (error) {
      importError.value = error instanceof Error ? error.message : 'Failed to import transactions';
    } finally {
      isImporting.value = false;
    }
  }

  function reset() {
    currentStep.value = 1;
    completedSteps.value = [];
    uploadedFile.value = null;
    fileBase64.value = null;
    isEstimating.value = false;
    costEstimate.value = null;
    estimateError.value = null;
    isExtracting.value = false;
    extractionResult.value = null;
    extractionError.value = null;
    selectedAccount.value = null;
    isNewAccount.value = false;
    manualCurrency.value = null;
    isDetectingDuplicates.value = false;
    duplicates.value = [];
    existingTransactions.value = [];
    overriddenDuplicateIndices.value = new Set();
    excludedTransactionIndices.value = new Set();
    isImporting.value = false;
    importResult.value = null;
    importError.value = null;
  }

  /**
   * Navigate to a step (used by accordion clicks).
   * Only allows going to the current step (no skipping via accordion).
   */
  function goToStep({ step }: { step: number }) {
    // Only allow navigating to current step (keeps accordion behavior but prevents skipping)
    if (step === currentStep.value) {
      return;
    }
    // Don't allow clicking on accordion headers to change steps
    // Users must use Back/Continue buttons
  }

  /**
   * Go back to a previous step (used by Back buttons).
   * Removes completion status of steps after the target step.
   */
  function goBackToStep({ step }: { step: number }) {
    if (step < currentStep.value) {
      // Remove completion status for all steps >= target step
      completedSteps.value = completedSteps.value.filter((s) => s < step);
      currentStep.value = step;
    }
  }

  return {
    // State
    currentStep,
    completedSteps,
    uploadedFile,
    fileBase64,
    isEstimating,
    costEstimate,
    estimateError,
    isExtracting,
    extractionResult,
    extractionError,
    selectedAccount,
    isNewAccount,
    manualCurrency,
    isDetectingDuplicates,
    duplicates,
    existingTransactions,
    overriddenDuplicateIndices,
    excludedTransactionIndices,
    isImporting,
    importResult,
    importError,

    // Computed
    detectedCurrency,
    effectiveCurrency,
    extractedDateRange,
    duplicateIndices,
    transactionsToImport,
    skipIndices,
    importSummary,

    // Actions
    setFile,
    estimateCost,
    extract,
    selectAccount,
    setManualCurrency,
    clearSelectedAccount,
    proceedFromAccountSelection,
    detectDuplicates,
    toggleDuplicateOverride,
    toggleTransactionExclusion,
    proceedToImport,
    executeImport,
    reset,
    goToStep,
    goBackToStep,
  };
});
