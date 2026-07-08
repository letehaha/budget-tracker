import {
  API_ERROR_CODES,
  type AccountMappingValue,
  AccountOptionValue,
  type CategoryMappingConfig,
  type CategoryMappingValue,
  CategoryOptionValue,
  type CsvImportProgress,
  type DetectDuplicatesResponse,
  type DuplicateMatch,
  type InvalidRow,
  type ParsedTransactionRow,
  SSE_EVENT_TYPES,
  type SourceAccount,
  type TagMappingConfig,
  type TagMappingValue,
  TagOptionValue,
  TransactionTypeOptionValue,
} from '@bt/shared/types';
import type { AccountMappingConfig } from '@bt/shared/types';

type UnpriceableRow = NonNullable<DetectDuplicatesResponse['unpriceableRows']>[number];
import { executeImport as executeImportApi, getCsvImportStatus } from '@/api/import-export';
import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const/vue-query';
import { useImportJobProgress } from '@/composable/use-import-job-progress';
import { useResolveMapping } from '@/composable/use-resolve-mapping';
import { useWizardSteps } from '@/composable/use-wizard-steps';
import { i18n } from '@/i18n';
import { ApiErrorResponseError } from '@/js/errors';
import { captureException } from '@/lib/sentry';
import {
  type ColumnMatchResult,
  classifyTransactionTypeValues,
  matchColumns,
} from '@/pages/import-export/utils/auto-match';
import { type ColumnMapping, buildInitialColumnMapping } from '@/pages/import-export/utils/build-initial-mapping';
import { toColumnMappingConfig } from '@/pages/import-export/utils/column-mapping-config';
import {
  isAccountDecided,
  isCategoryDecided,
  isCurrencyDecided,
  isTransactionTypeDecided,
} from '@/pages/import-export/utils/field-decision';
import { flattenCategories } from '@/pages/import-export/utils/flatten-categories';
import { distinctColumnValues, findUncoveredValues } from '@/pages/import-export/utils/transaction-type-coverage';
import { useQueryClient } from '@tanstack/vue-query';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { useAccountsStore } from './accounts';
import { useCategoriesStore } from './categories/categories';
import { useOnboardingStore } from './onboarding';
import { useTagsStore } from './tags';

/**
 * Wizard step identifiers, in canonical order. `'resolve'` is conditional —
 * `visibleSteps` omits it when `needsResolveStep` is false. Keys are the single
 * source of truth for navigation; the numeric `currentStep` / `completedSteps`
 * the store still exposes are projected from the key via STEP_KEY_TO_NUMBER.
 */
export type ImportStepKey = 'upload' | 'map' | 'resolve' | 'review' | 'results';

/** Every step in canonical order, before conditional filtering. */
const ALL_STEP_KEYS: readonly ImportStepKey[] = ['upload', 'map', 'resolve', 'review', 'results'];

/** Maps a step key to its 1-based number for the numeric step view. */
const STEP_KEY_TO_NUMBER: Record<ImportStepKey, number> = {
  upload: 1,
  map: 2,
  // Resolve shares the Map step's number so the numeric view keeps detect/review
  // at 3+ whether or not the conditional Resolve step is shown.
  resolve: 2,
  review: 3,
  results: 4,
};

const emptyColumnMapping = (): ColumnMapping => ({
  date: null,
  dateFieldOrder: null,
  amount: null,
  description: null,
  payee: null,
  category: null,
  tags: null,
  account: null,
  currency: null,
  transactionType: { option: TransactionTypeOptionValue.amountSign },
});

export const useImportExportStore = defineStore('importExport', () => {
  const queryClient = useQueryClient();

  // Step 1: File upload. Several CSVs are merged into one logical file before
  // parsing, so the rest of the pipeline still works on a single `fileContent`.
  const uploadedFiles = ref<File[]>([]);
  const fileContent = ref<string | null>(null);

  // Step 2: Parsing
  const csvHeaders = ref<string[]>([]);
  const csvPreview = ref<Record<string, string>[]>([]);
  // All data rows of the combined CSV (no header), aligned to `csvHeaders`. The
  // backend preview is capped at 50 rows, so the Map step scans these for the full
  // set of transaction-type values (which can appear past the preview window).
  const csvDataRows = ref<string[][]>([]);
  const detectedDelimiter = ref<string>(',');
  const totalRows = ref<number>(0);

  // Step 3: Column mapping
  const columnMapping = ref<ColumnMapping>(emptyColumnMapping());
  // Raw auto-match result, kept so Map-step rows can render per-field status
  // (auto-matched / suggested / needs-attention). Null until a file is parsed.
  const columnMatch = ref<ColumnMatchResult | null>(null);

  // Step 4: Account, Category, and Tag mapping (after extraction)
  const uniqueAccountsInCSV = ref<SourceAccount[]>([]);
  const accountMapping = ref<AccountMappingConfig>({});
  const uniqueCategoriesInCSV = ref<string[]>([]);
  const categoryMapping = ref<CategoryMappingConfig>({});
  const uniqueTagsInCSV = ref<string[]>([]);
  const tagMapping = ref<TagMappingConfig>({});

  // Currency mismatch warning from backend
  const currencyMismatchWarning = ref<string | null>(null);

  // Resolve step: extraction + entity-list loading state.
  const isExtracting = ref<boolean>(false);
  const extractError = ref<string | null>(null);
  // Set when loading the existing tags list fails, so the Resolve step can warn
  // that link-to-existing targets may be missing while still letting create/skip through.
  const tagsLoadFailed = ref<boolean>(false);

  // Step 5: Duplicate detection results
  const validRows = ref<ParsedTransactionRow[]>([]);
  const invalidRows = ref<InvalidRow[]>([]);
  const duplicates = ref<DuplicateMatch[]>([]);
  const unmarkedDuplicateIndices = ref<Set<number>>(new Set());
  // Rows whose currency has no exchange rate; user must skip or abort before import proceeds.
  const unpriceableRows = ref<UnpriceableRow[]>([]);

  // Step 5b: Duplicate-detection async state. Fires when the API call itself
  // fails (network, 5xx, etc.), as opposed to a successful response describing
  // a data problem (invalid rows, unpriceable rows).
  const isDetectingDuplicates = ref<boolean>(false);
  const detectError = ref<string | null>(null);

  // Step 6: Import execution (asynchronous).
  //
  // The execute endpoint enqueues a background job and returns a jobId; the
  // watchdog below follows it over SSE + a status poll, and the terminal
  // `summary` lives on `progress` (the `completed` branch of CsvImportProgress)
  // rather than a separate result ref.
  //
  // SSE + status-poll watchdog for the running import. Owns the live `progress`
  // and the terminal `executeError`. On success the wizard is already on the
  // `results` step, so completion only refreshes caches; lost contact bounces
  // back to `review` so the user can retry.
  const jobProgress = useImportJobProgress<CsvImportProgress>({
    sseEventType: SSE_EVENT_TYPES.CSV_IMPORT_PROGRESS,
    fetchStatus: getCsvImportStatus,
    onComplete: async ({ summary }) => {
      // Note: import_completed is tracked on the backend for reliability.

      // Mark onboarding task as complete.
      useOnboardingStore().completeTask('import-csv');

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

      // payeesList sits outside the transactionChange prefix, so it must be invalidated
      // explicitly. An import can create payees (mapped payee column) and always shifts
      // the transaction-count stats carried in the payee list, so refresh it unconditionally
      // so pickers and the payees table don't keep a pre-import snapshot.
      queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.payeesList });

      // The Pinia categories store is not VueQuery-backed, so invalidateQueries alone won't
      // refresh it. Call loadCategories explicitly so newly-created categories appear in
      // category pickers and lists without a full page reload.
      //
      // The import already succeeded by this point, so a refresh failure must NOT surface
      // as an import error. Swallow and log it instead of letting it reject the handler.
      if (summary.categoriesCreated > 0) {
        try {
          await useCategoriesStore().loadCategories({ force: true });
        } catch (refreshError) {
          captureException({ error: refreshError, context: { scope: 'import-csv:post-import-refresh' } });
        }
      }

      // Same reasoning for tags: Pinia store is not VueQuery-backed, so newly-created
      // tags must be loaded explicitly to appear in tag pickers without a page reload.
      // Also guarded so a post-success refresh failure never fake-fails the import.
      if (summary.tagsCreated > 0) {
        try {
          await useTagsStore().loadTags();
        } catch (refreshError) {
          captureException({ error: refreshError, context: { scope: 'import-csv:post-import-refresh' } });
        }
      }
    },
    // On failure the wizard stays on the results step, where the failed status
    // callout (with the server's error message) is rendered.
    onFailure: () => {},
    onLostContact: () => goToStep('review'),
  });
  const progress = jobProgress.progress;
  /** Terminal watchdog error (lost contact / expired job) for the results step. */
  const executeError = jobProgress.executeError;

  // Covers the gap between the execute POST being sent and the watchdog being
  // armed (progress is still null at that point), so the review-step button can
  // show a busy state immediately on click.
  const isEnqueuing = ref<boolean>(false);

  /** True while the import job is enqueuing or in flight (queued/running). Drives
   *  the review-step button's busy state. */
  const isExecuting = computed(
    () => isEnqueuing.value || progress.value?.status === 'queued' || progress.value?.status === 'running',
  );

  // ---- Step model getters ----

  /** Account assignment reads per-row values from a CSV column → Resolve must map them. */
  const needsAccountResolution = computed(
    () => columnMapping.value.account?.option === AccountOptionValue.dataSourceColumn,
  );

  /** Category assignment maps from a CSV column or creates new per value → Resolve must reconcile them. */
  const needsCategoryResolution = computed(() => {
    const category = columnMapping.value.category;
    return (
      category?.option === CategoryOptionValue.mapDataSourceColumn ||
      category?.option === CategoryOptionValue.createNewCategories
    );
  });

  /** Tags assignment maps per-row values from a CSV column → Resolve must map them. */
  const needsTagResolution = computed(() => columnMapping.value.tags?.option === TagOptionValue.mapDataSourceColumn);

  /**
   * True when at least one assignment uses a per-value method that the Resolve
   * step must reconcile: category (map-to-column or create-new), account
   * (from-column), or tags (map-to-column). Currency / transaction-type
   * "from column" do NOT need Resolve — they read straight from the row.
   */
  const needsResolveStep = computed(
    () => needsCategoryResolution.value || needsAccountResolution.value || needsTagResolution.value,
  );

  // UI state — key-based step model (the single source of truth). `'resolve'` is
  // omitted from `visibleSteps` when `needsResolveStep` is false.
  const {
    currentStepKey,
    completedStepKeys,
    visibleSteps,
    goToStep,
    goNext,
    goBack,
    markStepCompleted,
    reset: resetSteps,
  } = useWizardSteps<ImportStepKey>({
    stepKeys: ALL_STEP_KEYS,
    isStepVisible: (key) => key !== 'resolve' || needsResolveStep.value,
  });

  // Numeric step view derived from the key model. A numeric step API is part of
  // this store's public surface (template consumers reference step numbers), so
  // it is projected through STEP_KEY_TO_NUMBER rather than tracked separately.
  // `currentStep` is writable: setting a number jumps to the first key that maps
  // to it (Resolve and Map share number 2; Map is canonical).
  const NUMBER_TO_STEP_KEY = ALL_STEP_KEYS.reduce<Record<number, ImportStepKey>>((acc, key) => {
    const num = STEP_KEY_TO_NUMBER[key];
    if (!(num in acc)) acc[num] = key;
    return acc;
  }, {});

  const currentStep = computed<number>({
    get: () => STEP_KEY_TO_NUMBER[currentStepKey.value],
    set: (value) => {
      const key = NUMBER_TO_STEP_KEY[value];
      if (key) goToStep(key);
    },
  });

  const completedSteps = computed<number[]>(() => {
    const numbers = new Set<number>();
    for (const key of completedStepKeys.value) numbers.add(STEP_KEY_TO_NUMBER[key]);
    return [...numbers];
  });

  /**
   * Distinct values of the transaction-type column across the full data set, or
   * empty when the type isn't read from a column. Reads every row (not just the
   * 50-row preview) so values that first appear in later rows still count.
   */
  const transactionTypeColumnValues = computed<string[]>(() => {
    const transactionType = columnMapping.value.transactionType;
    if (transactionType.option !== TransactionTypeOptionValue.dataSourceColumn || !transactionType.columnName) {
      return [];
    }
    return distinctColumnValues({
      headers: csvHeaders.value,
      dataRows: csvDataRows.value,
      columnName: transactionType.columnName,
    });
  });

  /**
   * Type-column values not yet assigned to the income or expense list. Non-empty
   * here blocks the Map step (and is shown to the user) so the import never reaches
   * the backend with type values it can't classify.
   */
  const uncoveredTransactionTypeValues = computed<string[]>(() => {
    const transactionType = columnMapping.value.transactionType;
    if (transactionType.option !== TransactionTypeOptionValue.dataSourceColumn) return [];
    return findUncoveredValues({
      values: transactionTypeColumnValues.value,
      incomeValues: transactionType.incomeValues,
      expenseValues: transactionType.expenseValues,
    });
  });

  /**
   * Map step is valid once date + amount columns are chosen, the date column's
   * day/month order is explicitly confirmed, and each of
   * category / account / currency / transaction-type has BOTH a method and the
   * decision that method requires — a CSV column for column-based methods, an
   * entity id for single-existing, both value lists for transaction-type
   * from-column. A chosen method alone is not enough (e.g. "Create new
   * categories" with no column selected must still block Next). When a tags
   * column is mapped, its column name must be set too. Every value in a
   * type-from-column must also be assigned to income or expense.
   */
  const isMapStepValid = computed(() => {
    const m = columnMapping.value;

    if (!m.date || !m.amount) return false;
    // The day/month order is a forced, explicit user choice (auto-detection
    // only pre-suggests), so an unconfirmed order blocks Next.
    if (!m.dateFieldOrder) return false;
    if (!isCategoryDecided({ category: m.category })) return false;
    if (!isAccountDecided({ account: m.account })) return false;
    if (!isCurrencyDecided({ currency: m.currency })) return false;
    if (!isTransactionTypeDecided({ transactionType: m.transactionType })) return false;
    if (uncoveredTransactionTypeValues.value.length > 0) return false;

    if (m.tags?.option === TagOptionValue.mapDataSourceColumn && !m.tags.columnName) {
      return false;
    }

    return true;
  });

  /**
   * Per-entity "is this row fully decided" predicates, shared by the resolve
   * engine's validity check and resolved-count derivations. 'create-new'/'skip'
   * are complete as-is; 'link-existing' additionally needs a non-empty target id
   * so the backend receives a valid reference rather than an empty string.
   */
  const isAccountResolved = (mapping: AccountMappingValue | undefined): boolean =>
    mapping?.action === 'create-new' || (mapping?.action === 'link-existing' && !!mapping.accountId);
  const isCategoryResolved = (mapping: CategoryMappingValue | undefined): boolean =>
    mapping?.action === 'create-new' || (mapping?.action === 'link-existing' && !!mapping.categoryId);
  const isTagResolved = (mapping: TagMappingValue | undefined): boolean =>
    mapping?.action === 'create-new' ||
    mapping?.action === 'skip' ||
    (mapping?.action === 'link-existing' && !!mapping.tagId);

  /**
   * Shared resolve engine (bulk actions, step validity, duplicate-unmark toggle).
   * Each entity is active only when its column mapping needs reconciliation; an
   * inactive entity is ignored by every action and imposes no validity constraint.
   * Tag link targets, source names, and the `skip` action are CSV-specific and
   * supplied via the optional `tags` config.
   */
  const resolveEngine = useResolveMapping<AccountMappingValue, CategoryMappingValue, TagMappingValue>({
    accounts: {
      isActive: () => needsAccountResolution.value,
      getSources: () =>
        uniqueAccountsInCSV.value.map((account) => ({
          name: account.name,
          currencyCode: account.currency || undefined,
        })),
      getTargets: () =>
        (useAccountsStore().accounts ?? []).map((account) => ({
          id: String(account.id),
          name: account.name,
          currencyCode: account.currencyCode,
        })),
      mapping: accountMapping,
      toLink: (id) => ({ action: 'link-existing', accountId: id }),
      toCreate: () => ({ action: 'create-new' }),
      isResolved: isAccountResolved,
    },
    categories: {
      isActive: () => needsCategoryResolution.value,
      getSources: () => uniqueCategoriesInCSV.value.map((name) => ({ name })),
      getTargets: () =>
        flattenCategories({ categories: useCategoriesStore().formattedCategories }).map((category) => ({
          id: category.id,
          name: category.name,
        })),
      mapping: categoryMapping,
      toLink: (id) => ({ action: 'link-existing', categoryId: id }),
      toCreate: () => ({ action: 'create-new' }),
      isResolved: isCategoryResolved,
    },
    tags: {
      isActive: () => needsTagResolution.value,
      getSources: () => uniqueTagsInCSV.value.map((name) => ({ name })),
      getTargets: () => useTagsStore().tags.map((tag) => ({ id: String(tag.id), name: tag.name })),
      mapping: tagMapping,
      toLink: (id) => ({ action: 'link-existing', tagId: id }),
      toCreate: () => ({ action: 'create-new' }),
      toSkip: () => ({ action: 'skip' }),
      isResolved: isTagResolved,
    },
    unmarkedDuplicateIndices,
  });

  const {
    autoMatchResolveValues,
    quickMapExactMatches,
    quickCreateNewForUnmatched,
    quickSkipAllTags,
    resetResolveEntity,
    isResolveStepValid,
  } = resolveEngine;

  // ---- Other getters ----

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

  // ---- Async actions ----

  const parseFiles = async ({ files }: { files: File[] }) => {
    // Combine the selected CSVs into one canonical CSV string client-side. Throws
    // a MergeCsvError (header mismatch, unreadable/empty file, row-limit) that the
    // upload step maps to a localized message; the rest of the flow is unchanged.
    const { mergeCsvFiles } = await import('@/pages/import-export/utils/merge-csv-files');
    const merged = await mergeCsvFiles({ files });
    fileContent.value = merged.combinedContent;
    csvDataRows.value = merged.dataRows;

    // Call backend API to parse the combined CSV
    const { parseCsv } = await import('@/api/import-export');
    const response = await parseCsv({
      fileContent: fileContent.value,
    });

    csvHeaders.value = response.headers.filter((h) => h !== '');
    csvPreview.value = response.preview;
    detectedDelimiter.value = response.detectedDelimiter;
    totalRows.value = response.totalRows;

    // Run the pure column matcher over the parsed headers and seed the initial
    // mapping. The raw match result is retained for per-field status rendering.
    columnMatch.value = matchColumns({ headers: csvHeaders.value });
    columnMapping.value = buildInitialColumnMapping({
      matchResult: columnMatch.value,
      preview: csvPreview.value,
    });

    // buildInitialColumnMapping classifies transaction-type values from the 50-row
    // preview; re-classify over the full data so values that first appear in later
    // rows (common when several files are merged) are pre-assigned too. Anything
    // the classifier can't place is surfaced on the Map step via uncoveredTransactionTypeValues.
    const transactionType = columnMapping.value.transactionType;
    if (transactionType.option === TransactionTypeOptionValue.dataSourceColumn && transactionType.columnName) {
      const { income, expense } = classifyTransactionTypeValues({ distinctValues: transactionTypeColumnValues.value });
      columnMapping.value.transactionType = { ...transactionType, incomeValues: income, expenseValues: expense };
    }

    // Record the selection only once merge + parse have succeeded, so a failure
    // leaves the store untouched (no half-set uploadedFiles over stale fileContent)
    // and the upload step retries from a clean slate.
    uploadedFiles.value = files;

    goToStep('map');
    markStepCompleted('upload');
  };

  const detectDuplicates = async () => {
    const { detectDuplicates: detectDuplicatesApi } = await import('@/api/import-export');

    // Clear prior errors and unpriceable state before a fresh run — data-level
    // (unpriceableRows) and transport-level (detectError) are reset so stale
    // messages don't linger.
    unpriceableRows.value = [];
    detectError.value = null;
    isDetectingDuplicates.value = true;

    // This path runs only after isMapStepValid is true, so the mapping is
    // complete; a null projection here is defensive, not an expected state.
    const config = toColumnMappingConfig({ mapping: columnMapping.value });
    if (!config) {
      detectError.value = i18n.global.t('pages.importExport.resolveValues.extractFailed');
      isDetectingDuplicates.value = false;
      return;
    }

    try {
      const response: DetectDuplicatesResponse = await detectDuplicatesApi({
        fileContent: fileContent.value!,
        delimiter: detectedDelimiter.value,
        columnMapping: config,
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

      // Mapping (and Resolve, if it was shown) are done once detection succeeds;
      // advance the wizard to the Review step.
      markStepCompleted('map');
      if (needsResolveStep.value) {
        markStepCompleted('resolve');
      }
      goToStep('review');
    } catch (error) {
      // Surface the error message so the UI can render it; re-throw so callers
      // (e.g. handleContinue) can decide whether to show a global error boundary.
      detectError.value = error instanceof Error ? error.message : String(error);
      captureException({ error, context: { scope: 'import-csv:detect-duplicates' } });
      throw error;
    } finally {
      isDetectingDuplicates.value = false;
    }
  };

  // Positional signature preserved for the existing `@toggle="store.toggleDuplicateUnmark"`
  // binding in the review-duplicates step; delegates to the shared engine.
  const toggleDuplicateUnmark = (rowIndex: number) => resolveEngine.toggleDuplicateUnmark({ rowIndex });

  /**
   * Enqueues the asynchronous import job and arms the progress watchdog. The
   * server re-parses the raw file inside the worker, so the request carries the
   * raw `fileContent` + mapping (NOT pre-parsed `validRows`); the user's skip
   * indices stay valid only because the worker's re-parse is deterministic given
   * the same timezone the detect-duplicates step sent.
   *
   * Returns right after the job is accepted: the wizard advances to `results`
   * where the execute step renders live progress and the done step renders the
   * terminal summary.
   */
  const executeImport = async ({ skipUnpriceableIndices }: { skipUnpriceableIndices?: number[] } = {}) => {
    jobProgress.setExecuteError(null);

    // This path runs only after isMapStepValid is true, so the mapping is
    // complete; a null projection here is defensive, not an expected state.
    const config = toColumnMappingConfig({ mapping: columnMapping.value });
    if (!config) {
      jobProgress.setExecuteError(i18n.global.t('pages.importExport.csvImport.results.importFailed'));
      return;
    }

    // Calculate which duplicates should be skipped
    const skipDuplicateIndices = duplicates.value
      .filter((d) => !unmarkedDuplicateIndices.value.has(d.rowIndex))
      .map((d) => d.rowIndex);

    // Only send tagMapping when a tags column is actually mapped. When the user
    // deselects the tags column, tagMapping may still hold stale entries; sending
    // them would make the backend create tags the user opted out of. The backend
    // treats an omitted tagMapping as "no tags" (see execute-import service).
    const tagMappingPayload = columnMapping.value.tags ? tagMapping.value : undefined;

    isEnqueuing.value = true;
    let response: Awaited<ReturnType<typeof executeImportApi>>;
    try {
      response = await executeImportApi({
        fileContent: fileContent.value!,
        delimiter: detectedDelimiter.value,
        columnMapping: config,
        accountMapping: accountMapping.value,
        categoryMapping: categoryMapping.value,
        tagMapping: tagMappingPayload,
        skipDuplicateIndices,
        skipUnpriceableIndices,
        // Must match the timezone the detect-duplicates step sent — the worker
        // re-parses server-side and the user's skip indices are only valid if the
        // parse anchors dates to the same instants.
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    } catch (error) {
      // The call never started the job — keep the user on `review` (not marked
      // complete) so they can correct the input and retry.
      jobProgress.setExecuteError(i18n.global.t('pages.importExport.csvImport.results.importFailed'));
      captureException({ error, context: { scope: 'import-csv:execute' } });
      return;
    } finally {
      isEnqueuing.value = false;
    }

    // Job accepted: only now advance the wizard and arm the progress watchdog.
    markStepCompleted('review');
    goToStep('results');
    jobProgress.start({
      initialProgress: {
        jobId: response.jobId,
        status: 'queued',
        processedCount: 0,
        totalCount: 0,
      },
    });
  };

  // ---- Resolve step engine ----

  /**
   * Pulls the distinct source/account/tag values out of the CSV via the backend
   * and seeds the unique* lists the Resolve step renders. Prunes any stored
   * per-value mapping whose source value no longer appears, so a re-extraction
   * after the user edits column choices never leaves orphaned entries behind.
   *
   * Resolves on success or handled error; never rejects.
   */
  const extractUniqueValues = async (): Promise<void> => {
    const config = toColumnMappingConfig({ mapping: columnMapping.value });
    if (!config) {
      extractError.value = i18n.global.t('pages.importExport.resolveValues.extractFailed');
      return;
    }

    isExtracting.value = true;
    extractError.value = null;

    try {
      const { extractUniqueValues: extractUniqueValuesApi } = await import('@/api/import-export');

      const result = await extractUniqueValuesApi({
        fileContent: fileContent.value!,
        delimiter: detectedDelimiter.value,
        columnMapping: config,
      });

      uniqueAccountsInCSV.value = result.sourceAccounts;
      uniqueCategoriesInCSV.value = result.sourceCategories;
      currencyMismatchWarning.value = result.currencyMismatchWarning || null;

      // Prune stale category mappings for source values that no longer exist.
      if (needsCategoryResolution.value) {
        const sourceCategorySet = new Set(result.sourceCategories);
        Object.keys(categoryMapping.value).forEach((category) => {
          if (!sourceCategorySet.has(category)) delete categoryMapping.value[category];
        });
      }

      // Prune stale tag mappings.
      uniqueTagsInCSV.value = result.sourceTags;
      const sourceTagSet = new Set(result.sourceTags);
      Object.keys(tagMapping.value).forEach((tag) => {
        if (!sourceTagSet.has(tag)) delete tagMapping.value[tag];
      });

      // Prune stale account mappings.
      const sourceAccountNames = new Set(result.sourceAccounts.map((account) => account.name));
      Object.keys(accountMapping.value).forEach((name) => {
        if (!sourceAccountNames.has(name)) delete accountMapping.value[name];
      });
    } catch (error) {
      if (
        error instanceof ApiErrorResponseError &&
        (error.data.code === API_ERROR_CODES.validationError || error.data.code === API_ERROR_CODES.notFound)
      ) {
        // A validation/not-found response describes a fixable data problem — show
        // its message and don't report it to Sentry (not an unexpected bug).
        extractError.value = error.data.message ?? null;
      } else {
        extractError.value = i18n.global.t('pages.importExport.resolveValues.extractFailed');
        captureException({ error, context: { scope: 'import-csv:extract-unique-values' } });
      }
    } finally {
      isExtracting.value = false;
    }
  };

  /**
   * Readies the Resolve step: extracts the unique source values when missing,
   * loads the existing category/tag lists that link targets need, then runs a
   * non-destructive auto-match. Each fetch is independently guarded so a single
   * failure neither aborts the rest nor rejects the caller.
   */
  const prepareResolveStep = async (): Promise<void> => {
    const needsExtraction =
      (needsAccountResolution.value && uniqueAccountsInCSV.value.length === 0) ||
      (needsCategoryResolution.value && uniqueCategoriesInCSV.value.length === 0) ||
      (needsTagResolution.value && uniqueTagsInCSV.value.length === 0);

    if (needsExtraction) {
      await extractUniqueValues();
    }

    if (needsCategoryResolution.value && useCategoriesStore().categories.length === 0) {
      try {
        await useCategoriesStore().loadCategories();
      } catch (error) {
        captureException({ error, context: { scope: 'import-csv:load-categories' } });
      }
    }

    if (needsTagResolution.value && useTagsStore().tags.length === 0) {
      try {
        await useTagsStore().loadTags();
      } catch (error) {
        tagsLoadFailed.value = true;
        captureException({ error, context: { scope: 'import-csv:load-tags' } });
      }
    }

    autoMatchResolveValues({ overwrite: false });
  };

  const reset = () => {
    uploadedFiles.value = [];
    fileContent.value = null;
    csvHeaders.value = [];
    csvPreview.value = [];
    csvDataRows.value = [];
    detectedDelimiter.value = ',';
    totalRows.value = 0;
    columnMapping.value = emptyColumnMapping();
    columnMatch.value = null;
    uniqueAccountsInCSV.value = [];
    accountMapping.value = {};
    uniqueCategoriesInCSV.value = [];
    categoryMapping.value = {};
    uniqueTagsInCSV.value = [];
    tagMapping.value = {};
    currencyMismatchWarning.value = null;
    isExtracting.value = false;
    extractError.value = null;
    tagsLoadFailed.value = false;
    validRows.value = [];
    invalidRows.value = [];
    duplicates.value = [];
    unmarkedDuplicateIndices.value = new Set();
    unpriceableRows.value = [];
    isDetectingDuplicates.value = false;
    detectError.value = null;
    isEnqueuing.value = false;
    jobProgress.stop();
    jobProgress.setExecuteError(null);
    progress.value = null;
    resetSteps();
  };

  return {
    // State
    uploadedFiles,
    fileContent,
    csvHeaders,
    csvPreview,
    csvDataRows,
    detectedDelimiter,
    totalRows,
    columnMapping,
    columnMatch,
    uniqueAccountsInCSV,
    accountMapping,
    uniqueCategoriesInCSV,
    categoryMapping,
    uniqueTagsInCSV,
    tagMapping,
    currencyMismatchWarning,
    isExtracting,
    extractError,
    tagsLoadFailed,
    validRows,
    invalidRows,
    duplicates,
    unmarkedDuplicateIndices,
    unpriceableRows,
    isDetectingDuplicates,
    detectError,
    progress,
    executeError,
    isExecuting,
    currentStepKey,
    completedStepKeys,
    currentStep,
    completedSteps,

    // Getters
    needsResolveStep,
    needsAccountResolution,
    needsCategoryResolution,
    needsTagResolution,
    visibleSteps,
    isMapStepValid,
    uncoveredTransactionTypeValues,
    isResolveStepValid,
    importSummary,

    // Actions
    goToStep,
    goNext,
    goBack,
    parseFiles,
    detectDuplicates,
    toggleDuplicateUnmark,
    executeImport,
    extractUniqueValues,
    autoMatchResolveValues,
    quickMapExactMatches,
    quickCreateNewForUnmatched,
    quickSkipAllTags,
    resetResolveEntity,
    prepareResolveStep,
    reset,
  };
});
