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
import type {
  AccountModel,
  ExtractedMetadata,
  ExtractedTransaction,
  StatementCostEstimate,
  StatementExtractionResult,
} from '@bt/shared/types';
import type { TransactionModel } from '@bt/shared/types/db-models';
import { useQueryClient } from '@tanstack/vue-query';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { useOnboardingStore } from './onboarding';

/**
 * Statement Parser Store
 *
 * Manages the multi-step flow for importing transactions from bank statements:
 * 1. Upload & Estimate - Upload files and get a cost estimate per file
 * 2. Extract - AI extraction, one file at a time
 * 3. Account Selection - Select existing or create new account
 * 4. Review Duplicates - (only for existing accounts) Review and exclude duplicates
 * 5. Import - Execute import and show results
 *
 * Several statements can be selected at once. Each is estimated and extracted
 * independently — one AI call per file, so a file that fails only loses itself —
 * and the results are concatenated into a single list that the rest of the wizard
 * treats as one statement, landing in one account.
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

/**
 * One selected statement file and everything derived from it. Estimate and
 * extraction outcomes are per-file because each file is a separate AI call: a
 * corrupt page in statement 3 must not discard statements 1, 2 and 4.
 */
export interface StatementFileEntry {
  /** Stable identity — also how a re-selection of the same file is recognised. */
  id: string;
  file: File;
  fileBase64: string;
  costEstimate: StatementCostEstimate | null;
  estimateError: string | null;
  extraction: StatementExtractionResult | null;
  extractionError: string | null;
}

/**
 * Identity used both for de-duping a selection and as an entry's key. Matches
 * the identity `MultiFileDropzone` de-dupes on, so the two stay in step.
 */
function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (data:application/pdf;base64,...).
      resolve(result.split(',')[1] || result);
    };
    // Without this a failed read never settles, and awaiting it would hang the
    // whole selection rather than skipping the one unreadable file.
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

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

  // Step 1: File upload — one entry per selected statement, in selection order.
  const fileEntries = ref<StatementFileEntry[]>([]);

  // Step 2: Cost estimate. Per-file results live on the entries; these track
  // which file the batch is currently working through, for progress reporting.
  const isEstimating = ref(false);
  const estimatingFileId = ref<string | null>(null);

  // Step 3: Extraction (per-file results also live on the entries).
  const isExtracting = ref(false);
  const extractingFileId = ref<string | null>(null);

  // Step 4: Account selection (selectedAccount + isNewAccount declared above,
  // ahead of the step machine that reads them).
  // Manual currency selection (used when AI doesn't detect currency)
  const manualCurrency = ref<string | null>(null);

  // Step 5: Duplicate detection
  const isDetectingDuplicates = ref(false);
  const duplicates = ref<StatementDetectDuplicatesResponse['duplicates']>([]);
  // A failed check leaves `duplicates` empty, which reads exactly like a clean statement.
  const duplicateDetectionError = ref<string | null>(null);
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

  /**
   * Every extracted transaction across every file, concatenated in selection
   * order. This array defines the wizard's index space: duplicate matches,
   * manual exclusions and `skipIndices` are all positions in *here*, and it is
   * exactly what gets POSTed to detect-duplicates and execute — so the indices
   * the backend hands back line up without translation.
   */
  const mergedTransactions = computed<ExtractedTransaction[]>(() =>
    fileEntries.value.flatMap((entry) => entry.extraction?.transactions ?? []),
  );

  /**
   * Source file name for each merged index, so the review step can attribute a
   * row to the statement it came from.
   */
  const transactionSources = computed<string[]>(() =>
    fileEntries.value.flatMap((entry) => (entry.extraction?.transactions ?? []).map(() => entry.file.name)),
  );

  /** Files that produced transactions. */
  const extractedEntries = computed(() => fileEntries.value.filter((entry) => entry.extraction !== null));

  /**
   * Rows the extraction recognised but could not use, summed over the batch —
   * the warning is about the totals shown alongside it, which are batch-wide too.
   */
  const droppedRowCount = computed(() =>
    extractedEntries.value.reduce((sum, entry) => sum + entry.extraction!.droppedRowCount, 0),
  );

  /** Files whose extraction failed — kept visible so a partial import is explicit. */
  const extractionFailures = computed(() => fileEntries.value.filter((entry) => entry.extractionError !== null));

  /** Files whose cost estimate failed. */
  const estimateFailures = computed(() => fileEntries.value.filter((entry) => entry.estimateError !== null));

  /** Files still awaiting a cost estimate. A recorded failure needs `clearFailures` first. */
  const pendingEstimateEntries = computed(() =>
    fileEntries.value.filter((entry) => !entry.costEstimate && !entry.estimateError),
  );

  /**
   * Files extraction should still be attempted on.
   *
   * A failed estimate is excluded because the two endpoints share the same
   * server-side text extraction: if estimate-cost couldn't get text out of the
   * file, extract can't either, and sending it would spend an AI call to learn
   * what we already know. `clearFailures` puts such a file back in scope.
   */
  const extractableEntries = computed(() =>
    fileEntries.value.filter((entry) => !entry.extraction && !entry.estimateError),
  );

  /** Distinct non-empty values a metadata getter yields across parsed files. */
  function distinctMetadata(pick: (metadata: ExtractedMetadata) => string | undefined): string[] {
    const values = extractedEntries.value
      .map((entry) => pick(entry.extraction!.metadata))
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    return [...new Set(values)];
  }

  const detectedBankNames = computed(() => distinctMetadata((metadata) => metadata.bankName));
  const detectedCurrencies = computed(() => distinctMetadata((metadata) => metadata.currencyCode));

  /**
   * A detected value is only reported when every file that identified one agrees.
   * Disagreement is surfaced rather than guessed at: the whole selection lands in
   * a single account, so mixed currencies are the user's call to resolve.
   */
  const detectedBankName = computed(() =>
    detectedBankNames.value.length === 1 ? detectedBankNames.value[0] : undefined,
  );
  const detectedCurrency = computed(() =>
    detectedCurrencies.value.length === 1 ? detectedCurrencies.value[0] : undefined,
  );
  const hasCurrencyConflict = computed(() => detectedCurrencies.value.length > 1);

  /**
   * Effective currency - either AI-detected or manually selected by user
   */
  const effectiveCurrency = computed(() => detectedCurrency.value || manualCurrency.value);

  /**
   * The batch presented as one estimate, so the upload step can render it with the
   * same components a single-file estimate uses. Model and key source come from the
   * first estimate — they're resolved from the user's settings server-side, so
   * they're identical for every file.
   *
   * `estimatedCostUsd` stays null if *any* file's price is unknown: a partial sum
   * would read as the batch total and understate it.
   */
  const costEstimateTotals = computed(() => {
    const estimates = fileEntries.value
      .map((entry) => entry.costEstimate)
      .filter((estimate): estimate is StatementCostEstimate => estimate !== null);
    if (!estimates.length) return null;

    const first = estimates[0]!;
    const hasUnpricedFile = estimates.some((estimate) => estimate.estimatedCostUsd === null);

    return {
      ...first,
      fileCount: estimates.length,
      estimatedInputTokens: estimates.reduce((sum, estimate) => sum + estimate.estimatedInputTokens, 0),
      estimatedOutputTokens: estimates.reduce((sum, estimate) => sum + estimate.estimatedOutputTokens, 0),
      estimatedCostUsd: hasUnpricedFile
        ? null
        : estimates.reduce((sum, estimate) => sum + (estimate.estimatedCostUsd ?? 0), 0),
    };
  });

  /**
   * Get the date range of extracted transactions for fetching existing transactions
   */
  const extractedDateRange = computed(() => {
    if (!mergedTransactions.value.length) return null;

    const dates = mergedTransactions.value.map((tx) => tx.date.split(' ')[0]!);
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
  const transactionsToImport = computed(() =>
    mergedTransactions.value.filter((_, index) => {
      // Exclude if manually excluded
      if (excludedTransactionIndices.value.has(index)) return false;

      // Include if duplicate but overridden
      if (duplicateIndices.value.has(index) && overriddenDuplicateIndices.value.has(index)) return true;

      // Exclude if duplicate and not overridden
      if (duplicateIndices.value.has(index)) return false;

      return true;
    }),
  );

  /**
   * Get indices of transactions to skip during import
   */
  const skipIndices = computed(() => {
    const indices: number[] = [];

    mergedTransactions.value.forEach((_, index) => {
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
    total: mergedTransactions.value.length,
    toImport: transactionsToImport.value.length,
    duplicates: duplicates.value.length,
    excluded: excludedTransactionIndices.value.size,
    overridden: overriddenDuplicateIndices.value.size,
    files: extractedEntries.value.length,
  }));

  /**
   * Drops everything derived from the merged transaction list. Called whenever
   * the file selection changes: adding or removing a file re-bases every merged
   * index, so duplicate matches and exclusions can't be adjusted — only discarded.
   */
  function clearDerivedState() {
    selectedAccount.value = null;
    isNewAccount.value = false;
    manualCurrency.value = null;
    isDetectingDuplicates.value = false;
    duplicates.value = [];
    duplicateDetectionError.value = null;
    existingTransactions.value = [];
    overriddenDuplicateIndices.value = new Set();
    excludedTransactionIndices.value = new Set();
    isImporting.value = false;
    importResult.value = null;
    importError.value = null;
  }

  /**
   * Replaces the selection with `files`, preserving the estimate and extraction
   * already paid for on any file that is still selected (identity is name + size
   * + lastModified) so re-ordering or removing one file doesn't re-run the AI on
   * the others.
   *
   * Returns the names of files that could not be read, for the caller to report —
   * the store deliberately produces no user-facing strings of its own.
   */
  async function setFiles({ files }: { files: File[] }): Promise<{ unreadable: string[] }> {
    const existing = new Map(fileEntries.value.map((entry) => [entry.id, entry]));

    // An identical selection is a no-op. Without this, re-validating the same
    // list (which the upload step does on every dropzone emit) would reset the
    // wizard and throw away duplicate decisions the user had already made.
    const unchanged =
      files.length === fileEntries.value.length && files.every((file, i) => fileKey(file) === fileEntries.value[i]!.id);
    if (unchanged) return { unreadable: [] };

    const next: StatementFileEntry[] = [];
    const unreadable: string[] = [];

    for (const file of files) {
      const id = fileKey(file);
      const kept = existing.get(id);
      if (kept) {
        next.push(kept);
        continue;
      }

      try {
        next.push({
          id,
          file,
          fileBase64: await readFileAsBase64(file),
          costEstimate: null,
          estimateError: null,
          extraction: null,
          extractionError: null,
        });
      } catch {
        unreadable.push(file.name);
      }
    }

    fileEntries.value = next;
    clearDerivedState();
    // Send the wizard back to the start: any completed step downstream was
    // completed against the previous selection.
    resetSteps();

    return { unreadable };
  }

  /**
   * Estimates every file in turn. A second call only retries the files that have
   * no estimate yet, so a partial failure can be re-attempted without paying for
   * the successful ones again.
   */
  async function estimateCosts() {
    if (isEstimating.value || !fileEntries.value.length) return;

    isEstimating.value = true;

    try {
      for (const entry of pendingEstimateEntries.value) {
        estimatingFileId.value = entry.id;

        try {
          const result = await estimateStatementCost({ fileBase64: entry.fileBase64 });

          if ('success' in result && (result as StatementCostEstimateFailure).success === false) {
            const failure = result as StatementCostEstimateFailure;
            entry.estimateError = failure.error?.message || failure.suggestion || 'Failed to analyze file';
          } else {
            entry.costEstimate = result as StatementCostEstimate;
          }
        } catch (error) {
          entry.estimateError = error instanceof Error ? error.message : 'Failed to estimate cost';
        }
      }
    } finally {
      estimatingFileId.value = null;
      isEstimating.value = false;
    }
  }

  /**
   * Extracts transactions from each file in turn — one AI call per file, never
   * concurrent, so a large selection can't fan out into simultaneous requests.
   *
   * A file that fails does not block the rest: whatever parsed is carried
   * forward and the failures stay visible on the upload step. As with the
   * estimate, re-running only retries the files that produced nothing.
   */
  async function extractAll() {
    if (isExtracting.value || !fileEntries.value.length) return;

    isExtracting.value = true;

    try {
      for (const entry of extractableEntries.value) {
        extractingFileId.value = entry.id;

        try {
          entry.extraction = await extractStatementTransactions({ fileBase64: entry.fileBase64 });

          trackAnalyticsEvent({
            event: 'ai_feature_used',
            properties: { feature: 'statement_parser' },
          });
        } catch (error) {
          entry.extractionError = error instanceof Error ? error.message : 'Failed to extract transactions';
        }
      }
    } finally {
      extractingFileId.value = null;
      isExtracting.value = false;
    }

    // Only a complete wipeout keeps us on the upload step.
    if (mergedTransactions.value.length) {
      markStepCompleted('upload');
      goToStep('account');
    }
  }

  /**
   * Clears recorded failures so the next `estimateCosts` / `extractAll` retries
   * them. Files that already succeeded keep their result and are skipped, so a
   * retry never re-spends on work already paid for.
   */
  function clearFailures() {
    fileEntries.value.forEach((entry) => {
      entry.estimateError = null;
      entry.extractionError = null;
    });
  }

  function selectAccount({ account, isNew = false }: { account: AccountModel; isNew?: boolean }) {
    selectedAccount.value = account;
    isNewAccount.value = isNew;

    // Reset duplicate detection when account changes
    duplicates.value = [];
    duplicateDetectionError.value = null;
    overriddenDuplicateIndices.value = new Set();
  }

  function setManualCurrency({ currencyCode }: { currencyCode: string | null }) {
    manualCurrency.value = currencyCode;
  }

  function clearSelectedAccount() {
    selectedAccount.value = null;
    isNewAccount.value = false;
    duplicates.value = [];
    duplicateDetectionError.value = null;
    overriddenDuplicateIndices.value = new Set();
  }

  async function proceedFromAccountSelection() {
    if (!selectedAccount.value || !mergedTransactions.value.length) return;

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
    if (!selectedAccount.value || !mergedTransactions.value.length) return;

    isDetectingDuplicates.value = true;
    duplicateDetectionError.value = null;
    duplicates.value = [];
    existingTransactions.value = [];

    try {
      // Fetch duplicates and existing transactions in parallel. The merged list
      // goes over the wire as one batch, so the returned `transactionIndex`
      // values are already merged indices.
      const duplicatesPromise = detectStatementDuplicates({
        accountId: selectedAccount.value.id,
        transactions: mergedTransactions.value,
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
      // A missing duplicate check does not block the import, so record the reason
      // instead of throwing.
      duplicateDetectionError.value = error instanceof Error ? error.message : 'Failed to check for duplicates';
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
    if (!selectedAccount.value || !mergedTransactions.value.length) return;

    isImporting.value = true;
    importError.value = null;
    importResult.value = null;

    try {
      const result = await executeStatementImport({
        accountId: selectedAccount.value.id,
        transactions: mergedTransactions.value,
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
    fileEntries.value = [];
    isEstimating.value = false;
    estimatingFileId.value = null;
    isExtracting.value = false;
    extractingFileId.value = null;
    clearDerivedState();
  }

  return {
    // State
    currentStepKey,
    completedStepKeys,
    visibleSteps,
    fileEntries,
    isEstimating,
    estimatingFileId,
    isExtracting,
    extractingFileId,
    selectedAccount,
    isNewAccount,
    manualCurrency,
    isDetectingDuplicates,
    duplicates,
    duplicateDetectionError,
    existingTransactions,
    overriddenDuplicateIndices,
    excludedTransactionIndices,
    isImporting,
    importResult,
    importError,

    // Computed
    mergedTransactions,
    transactionSources,
    extractedEntries,
    droppedRowCount,
    extractionFailures,
    estimateFailures,
    pendingEstimateEntries,
    extractableEntries,
    costEstimateTotals,
    detectedBankName,
    detectedBankNames,
    detectedCurrency,
    detectedCurrencies,
    hasCurrencyConflict,
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
    setFiles,
    estimateCosts,
    extractAll,
    clearFailures,
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
