import {
  API_ERROR_CODES,
  type AccountMappingValue,
  AccountOptionValue,
  type CategoryMappingConfig,
  type CategoryMappingValue,
  CategoryOptionValue,
  type DateColumnError,
  type DetectDuplicatesResponse,
  type DuplicateMatch,
  type ExecuteImportResponse,
  type InvalidRow,
  type ParsedTransactionRow,
  type SourceAccount,
  type TagMappingConfig,
  type TagMappingValue,
  TagOptionValue,
  TransactionTypeOptionValue,
} from '@bt/shared/types';
import type { AccountMappingConfig } from '@bt/shared/types';

type UnpriceableRow = NonNullable<DetectDuplicatesResponse['unpriceableRows']>[number];
import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const/vue-query';
import { i18n } from '@/i18n';
import { ApiErrorResponseError } from '@/js/errors';
import { captureException } from '@/lib/sentry';
import { type ColumnMatchResult, matchColumns } from '@/pages/import-export/utils/auto-match';
import { type ColumnMapping, buildInitialColumnMapping } from '@/pages/import-export/utils/build-initial-mapping';
import { toColumnMappingConfig } from '@/pages/import-export/utils/column-mapping-config';
import {
  isAccountDecided,
  isCategoryDecided,
  isCurrencyDecided,
  isTransactionTypeDecided,
} from '@/pages/import-export/utils/field-decision';
import { flattenCategories } from '@/pages/import-export/utils/flatten-categories';
import {
  computeAutoMatchEntries,
  computeCreateForUnresolved,
  computeExactLinkEntries,
} from '@/pages/import-export/utils/resolve-mapping';
import { useQueryClient } from '@tanstack/vue-query';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { useAccountsStore } from './accounts';
import { useCategoriesStore } from './categories/categories';
import { useOnboardingStore } from './onboarding';
import { useTagsStore } from './tags';

/**
 * Wizard step identifiers, in canonical order. `'resolve'` is conditional —
 * `visibleSteps` omits it when `needsResolveStep` is false. Keys are the source
 * of truth for navigation; the legacy numeric `currentStep` is kept in sync for
 * older shell/step code that still reads it.
 */
export type ImportStepKey = 'upload' | 'map' | 'resolve' | 'review' | 'results';

/** Every step in canonical order, before conditional filtering. */
const ALL_STEP_KEYS: readonly ImportStepKey[] = ['upload', 'map', 'resolve', 'review', 'results'];

/** Maps a step key to the legacy 1-based numeric step used by older components. */
const STEP_KEY_TO_NUMBER: Record<ImportStepKey, number> = {
  upload: 1,
  map: 2,
  // Resolve historically lived inside the old step 2; it shares its number so
  // legacy numeric consumers keep treating detect/review as step 3+.
  resolve: 2,
  review: 3,
  results: 4,
};

const emptyColumnMapping = (): ColumnMapping => ({
  date: null,
  amount: null,
  description: null,
  category: null,
  tags: null,
  account: null,
  currency: null,
  transactionType: { option: TransactionTypeOptionValue.amountSign },
});

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

  // UI state — key-based step model (source of truth) plus the legacy numeric
  // mirror that older shell/step components still read.
  const currentStepKey = ref<ImportStepKey>('upload');
  const completedStepKeys = ref<Set<ImportStepKey>>(new Set());
  const currentStep = ref<number>(1);
  const completedSteps = ref<number[]>([]);

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

  /** Ordered list of steps to render, omitting `'resolve'` when not needed. */
  const visibleSteps = computed<{ key: ImportStepKey }[]>(() =>
    ALL_STEP_KEYS.filter((key) => key !== 'resolve' || needsResolveStep.value).map((key) => ({ key })),
  );

  /**
   * Map step is valid once date + amount columns are chosen and each of
   * category / account / currency / transaction-type has BOTH a method and the
   * decision that method requires — a CSV column for column-based methods, an
   * entity id for single-existing, both value lists for transaction-type
   * from-column. A chosen method alone is not enough (e.g. "Create new
   * categories" with no column selected must still block Next). When a tags
   * column is mapped, its column name must be set too.
   */
  const isMapStepValid = computed(() => {
    const m = columnMapping.value;

    if (!m.date || !m.amount) return false;
    if (!isCategoryDecided({ category: m.category })) return false;
    if (!isAccountDecided({ account: m.account })) return false;
    if (!isCurrencyDecided({ currency: m.currency })) return false;
    if (!isTransactionTypeDecided({ transactionType: m.transactionType })) return false;

    if (m.tags?.option === TagOptionValue.mapDataSourceColumn && !m.tags.columnName) {
      return false;
    }

    return true;
  });

  /**
   * Resolve step is valid when every per-value row that the active methods
   * require has a fully-resolved action. 'create-new'/'skip' are complete as-is;
   * 'link-existing' additionally needs a non-empty target id so the backend
   * receives a valid reference rather than an empty string.
   */
  const isResolveStepValid = computed(() => {
    const accountOption = columnMapping.value.account;
    if (accountOption?.option === AccountOptionValue.dataSourceColumn) {
      const allMapped = uniqueAccountsInCSV.value.every((account) => {
        const mapping = accountMapping.value[account.name];
        return mapping?.action === 'create-new' || (mapping?.action === 'link-existing' && !!mapping.accountId);
      });
      if (!allMapped) return false;
    }

    const categoryOption = columnMapping.value.category;
    if (categoryOption?.option === CategoryOptionValue.mapDataSourceColumn) {
      const allMapped = uniqueCategoriesInCSV.value.every((category) => {
        const mapping = categoryMapping.value[category];
        return mapping?.action === 'create-new' || (mapping?.action === 'link-existing' && !!mapping.categoryId);
      });
      if (!allMapped) return false;
    }

    const tagsOption = columnMapping.value.tags;
    if (tagsOption?.option === TagOptionValue.mapDataSourceColumn) {
      const allDecided = uniqueTagsInCSV.value.every((tag) => {
        const mapping = tagMapping.value[tag];
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

  // ---- Step navigation actions ----

  /** Sets the active step by key and mirrors the legacy numeric value. */
  const goToStep = (key: ImportStepKey) => {
    currentStepKey.value = key;
    currentStep.value = STEP_KEY_TO_NUMBER[key];
  };

  /** Marks a step complete in both the key set and the legacy numeric array. */
  const markStepCompleted = (key: ImportStepKey) => {
    completedStepKeys.value.add(key);
    const num = STEP_KEY_TO_NUMBER[key];
    if (!completedSteps.value.includes(num)) {
      completedSteps.value.push(num);
    }
  };

  /** Advances to the next visible step (resolve is skipped when not needed). */
  const goNext = () => {
    const steps = visibleSteps.value;
    const index = steps.findIndex((s) => s.key === currentStepKey.value);
    if (index === -1) return;
    markStepCompleted(currentStepKey.value);
    const next = steps[index + 1];
    if (next) goToStep(next.key);
  };

  /** Walks back to the previous visible step. */
  const goBack = () => {
    const steps = visibleSteps.value;
    const index = steps.findIndex((s) => s.key === currentStepKey.value);
    if (index <= 0) return;
    const prev = steps[index - 1];
    if (prev) goToStep(prev.key);
  };

  // ---- Async actions ----

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

    // Run the pure column matcher over the parsed headers and seed the initial
    // mapping. The raw match result is retained for per-field status rendering.
    columnMatch.value = matchColumns({ headers: csvHeaders.value });
    columnMapping.value = buildInitialColumnMapping({
      matchResult: columnMatch.value,
      preview: csvPreview.value,
    });

    goToStep('map');
    markStepCompleted('upload');
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

      if (response.dateColumnError) {
        // Date column has mixed day/month order — import is blocked; stay on mapping step.
        dateColumnError.value = response.dateColumnError;
        return;
      }

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
          captureException({ error: refreshError, context: { scope: 'import-csv:post-import-refresh' } });
        }
      }

      // Same reasoning for tags: Pinia store is not VueQuery-backed, so newly-created
      // tags must be loaded explicitly to appear in tag pickers without a page reload.
      // Also guarded so a post-success refresh failure never fake-fails the import.
      if (response.summary.tagsCreated > 0) {
        try {
          await useTagsStore().loadTags();
        } catch (refreshError) {
          captureException({ error: refreshError, context: { scope: 'import-csv:post-import-refresh' } });
        }
      }

      markStepCompleted('review');
      goToStep('results');
    } catch (error) {
      // A genuine import-API failure: surface a user-readable message for the UI to render,
      // then re-throw so callers can react (their handlers absorb the rejection).
      importError.value = i18n.global.t('pages.importExport.csvImport.results.importFailed');
      throw error;
    } finally {
      importInProgress.value = false;
    }
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

  /** Currency-aware CSV-side account sources for matching. */
  const accountResolveSources = () =>
    uniqueAccountsInCSV.value.map((account) => ({ name: account.name, currencyCode: account.currency || undefined }));

  /** Existing accounts as link targets (id stringified for the wire shape). */
  const accountResolveTargets = () =>
    (useAccountsStore().accounts ?? []).map((account) => ({
      id: String(account.id),
      name: account.name,
      currencyCode: account.currencyCode,
    }));

  const categoryResolveSources = () => uniqueCategoriesInCSV.value.map((name) => ({ name }));

  const categoryResolveTargets = () =>
    flattenCategories({ categories: useCategoriesStore().formattedCategories }).map((category) => ({
      id: category.id,
      name: category.name,
    }));

  const tagResolveSources = () => uniqueTagsInCSV.value.map((name) => ({ name }));

  const tagResolveTargets = () => useTagsStore().tags.map((tag) => ({ id: String(tag.id), name: tag.name }));

  /**
   * Pre-fills every active entity's mapping by name: link to a matched existing
   * entity, else fall back to "create new". With `overwrite: false`, rows the
   * user already decided are left untouched.
   */
  const autoMatchResolveValues = ({ overwrite }: { overwrite: boolean }): void => {
    if (needsAccountResolution.value) {
      Object.assign(
        accountMapping.value,
        computeAutoMatchEntries<AccountMappingValue>({
          sources: accountResolveSources(),
          targets: accountResolveTargets(),
          current: accountMapping.value,
          overwrite,
          toLink: (id) => ({ action: 'link-existing', accountId: id }),
          toCreate: () => ({ action: 'create-new' }),
        }),
      );
    }

    if (needsCategoryResolution.value) {
      Object.assign(
        categoryMapping.value,
        computeAutoMatchEntries<CategoryMappingValue>({
          sources: categoryResolveSources(),
          targets: categoryResolveTargets(),
          current: categoryMapping.value,
          overwrite,
          toLink: (id) => ({ action: 'link-existing', categoryId: id }),
          toCreate: () => ({ action: 'create-new' }),
        }),
      );
    }

    if (needsTagResolution.value) {
      Object.assign(
        tagMapping.value,
        computeAutoMatchEntries<TagMappingValue>({
          sources: tagResolveSources(),
          targets: tagResolveTargets(),
          current: tagMapping.value,
          overwrite,
          toLink: (id) => ({ action: 'link-existing', tagId: id }),
          toCreate: () => ({ action: 'create-new' }),
        }),
      );
    }
  };

  /** Link only the exact-name matches for one entity, overwriting those rows. */
  const quickMapExactMatches = ({ entity }: { entity: 'accounts' | 'categories' | 'tags' }): void => {
    if (entity === 'accounts') {
      Object.assign(
        accountMapping.value,
        computeExactLinkEntries<AccountMappingValue>({
          sources: accountResolveSources(),
          targets: accountResolveTargets(),
          toLink: (id) => ({ action: 'link-existing', accountId: id }),
        }),
      );
    } else if (entity === 'categories') {
      Object.assign(
        categoryMapping.value,
        computeExactLinkEntries<CategoryMappingValue>({
          sources: categoryResolveSources(),
          targets: categoryResolveTargets(),
          toLink: (id) => ({ action: 'link-existing', categoryId: id }),
        }),
      );
    } else {
      Object.assign(
        tagMapping.value,
        computeExactLinkEntries<TagMappingValue>({
          sources: tagResolveSources(),
          targets: tagResolveTargets(),
          toLink: (id) => ({ action: 'link-existing', tagId: id }),
        }),
      );
    }
  };

  /** Set "create new" for every still-unresolved row of one entity. */
  const quickCreateNewForUnmatched = ({ entity }: { entity: 'accounts' | 'categories' | 'tags' }): void => {
    if (entity === 'accounts') {
      Object.assign(
        accountMapping.value,
        computeCreateForUnresolved<AccountMappingValue>({
          names: uniqueAccountsInCSV.value.map((account) => account.name),
          current: accountMapping.value,
          isUnresolved: (entry) => !entry || (entry.action === 'link-existing' && !entry.accountId),
          toCreate: () => ({ action: 'create-new' }),
        }),
      );
    } else if (entity === 'categories') {
      Object.assign(
        categoryMapping.value,
        computeCreateForUnresolved<CategoryMappingValue>({
          names: uniqueCategoriesInCSV.value,
          current: categoryMapping.value,
          isUnresolved: (entry) => !entry || (entry.action === 'link-existing' && !entry.categoryId),
          toCreate: () => ({ action: 'create-new' }),
        }),
      );
    } else {
      Object.assign(
        tagMapping.value,
        computeCreateForUnresolved<TagMappingValue>({
          names: uniqueTagsInCSV.value,
          current: tagMapping.value,
          isUnresolved: (entry) => !entry || (entry.action === 'link-existing' && !entry.tagId),
          toCreate: () => ({ action: 'create-new' }),
        }),
      );
    }
  };

  /** Mark every source tag value as skipped. */
  const quickSkipAllTags = (): void => {
    for (const tagName of uniqueTagsInCSV.value) {
      tagMapping.value[tagName] = { action: 'skip' };
    }
  };

  /** Clear one entity's stored choices, then re-seed via name auto-match. */
  const resetResolveEntity = ({ entity }: { entity: 'accounts' | 'categories' | 'tags' }): void => {
    if (entity === 'accounts') {
      for (const account of uniqueAccountsInCSV.value) delete accountMapping.value[account.name];
    } else if (entity === 'categories') {
      for (const categoryName of uniqueCategoriesInCSV.value) delete categoryMapping.value[categoryName];
    } else {
      for (const tagName of uniqueTagsInCSV.value) delete tagMapping.value[tagName];
    }
    autoMatchResolveValues({ overwrite: false });
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
    uploadedFile.value = null;
    fileContent.value = null;
    csvHeaders.value = [];
    csvPreview.value = [];
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
    dateColumnError.value = null;
    unpriceableRows.value = [];
    isDetectingDuplicates.value = false;
    detectError.value = null;
    importInProgress.value = false;
    importResult.value = null;
    importError.value = null;
    currentStepKey.value = 'upload';
    completedStepKeys.value = new Set();
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
    dateColumnError,
    unpriceableRows,
    isDetectingDuplicates,
    detectError,
    importInProgress,
    importResult,
    importError,
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
    isResolveStepValid,
    importSummary,

    // Actions
    goToStep,
    goNext,
    goBack,
    parseFile,
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
