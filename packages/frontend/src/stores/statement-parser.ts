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
import { useWizardSteps } from '@/composable/use-wizard-steps';
import { trackAnalyticsEvent } from '@/lib/posthog';
import type { AccountModel, StatementCostEstimate, StatementExtractionResult } from '@bt/shared/types';
import type { TransactionModel } from '@bt/shared/types/db-models';
import { useQueryClient } from '@tanstack/vue-query';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { useOnboardingStore } from './onboarding';

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

/**
 * Wizard steps, mirroring the CSV/Wallet importers' key-based step machine:
 *  - `upload`  — file upload + AI extraction
 *  - `account` — select an existing account or create a new one
 *  - `review`  — review/exclude detected duplicates (existing accounts only)
 *  - `results` — confirm + execute import, then show the summary
 */
export type StatementParserStepKey = 'upload' | 'account' | 'review' | 'results';

/** Every step in canonical order. `review` is filtered out for new accounts. */
const ALL_STEP_KEYS: readonly StatementParserStepKey[] = ['upload', 'account', 'review', 'results'];

export const useStatementParserStore = defineStore('statementParser', () => {
  const queryClient = useQueryClient();

  // Account selection state — declared up front because the wizard's `review`
  // step is only visible for existing accounts, so the key-based step machine's
  // visibility predicate (below) reads `isNewAccount`.
  const selectedAccount = ref<AccountModel | null>(null);
  const isNewAccount = ref(false);

  // Step tracking — key-based machine shared with the CSV/Wallet importers.
  const {
    currentStepKey,
    completedStepKeys,
    visibleSteps,
    goToStep,
    goBack,
    markStepCompleted,
    reset: resetSteps,
  } = useWizardSteps<StatementParserStepKey>({
    stepKeys: ALL_STEP_KEYS,
    // The duplicate-review step only applies to imports into an existing account;
    // a brand-new account has nothing to detect duplicates against, so it's hidden
    // and navigation skips straight from account selection to import.
    isStepVisible: (key) => (key === 'review' ? !isNewAccount.value : true),
  });

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

  // Step 4: Account selection (selectedAccount + isNewAccount declared above,
  // ahead of the step machine that reads them).
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

      trackAnalyticsEvent({
        event: 'ai_feature_used',
        properties: { feature: 'statement_parser' },
      });

      // Mark upload complete and move to account selection.
      markStepCompleted('upload');
      goToStep('account');
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

    markStepCompleted('account');

    if (isNewAccount.value) {
      // New account: the `review` step is hidden (nothing to detect duplicates
      // against), so jump straight to import.
      goToStep('results');
    } else {
      // Detect duplicates for existing accounts.
      goToStep('review');
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
            offset: 0,
            limit: 1000, // Reasonable limit for a statement period
            accountIds: [selectedAccount.value.id],
            from: dateRange.startDate,
            to: dateRange.endDate,
          })
        : Promise.resolve([]);

      const [duplicatesResult, existingResult] = await Promise.all([duplicatesPromise, existingPromise]);

      duplicates.value = duplicatesResult.duplicates;
      existingTransactions.value = existingResult;

      // Mark duplicate review step as completed
      markStepCompleted('review');
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
    markStepCompleted('review');
    goToStep('results');
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

      // Note: import_completed is tracked on the backend for reliability

      // Mark onboarding task as complete
      const onboardingStore = useOnboardingStore();
      onboardingStore.completeTask('import-csv');

      // Invalidate all queries to refetch data after import
      queryClient.invalidateQueries();
    } catch (error) {
      importError.value = error instanceof Error ? error.message : 'Failed to import transactions';
    } finally {
      isImporting.value = false;
    }
  }

  function reset() {
    resetSteps();
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

  return {
    // State
    currentStepKey,
    completedStepKeys,
    visibleSteps,
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

    // Step navigation
    goToStep,
    goBack,

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
  };
});
