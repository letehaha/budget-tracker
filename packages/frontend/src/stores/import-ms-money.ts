import {
  detectMsMoneyDuplicates as apiDetectMsMoneyDuplicates,
  executeMsMoneyImport,
  getMsMoneyImportStatus,
  uploadMsMoneyFile,
} from '@/api/import-ms-money';
import { refreshResourceLease } from '@/api/resource-leases';
import { getErrorMessage } from '@/common/utils/error-message';
import { useCategoryMappingPresets } from '@/composable/use-category-mapping-presets';
import { useImportJobProgress } from '@/composable/use-import-job-progress';
import { useRecalculateBalanceToggle } from '@/composable/use-recalculate-balance-toggle';
import { useResolveMapping } from '@/composable/use-resolve-mapping';
import { useWizardSteps } from '@/composable/use-wizard-steps';
import { i18n } from '@/i18n';
import { captureException } from '@/lib/sentry';
import { flattenCategories } from '@/pages/import-export/utils/flatten-categories';
import { useAccountsStore } from '@/stores/accounts';
import { useCategoriesStore } from '@/stores/categories/categories';
import { useCurrenciesStore } from '@/stores/currencies';
import { useTagsStore } from '@/stores/tags';
import {
  ResourceLeaseType,
  SSE_EVENT_TYPES,
  type CategoryMappingConfig,
  type CategoryMappingPreset,
  type CategoryMappingValue,
  type DuplicateMatch,
  type MsMoneyAccountMapping,
  type MsMoneyImportProgress,
  type MsMoneyParseResult,
  type ResourceLease,
} from '@bt/shared/types';
import { useQueryClient } from '@tanstack/vue-query';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

/**
 * Wizard steps:
 *  - `upload`  — pick the `.mny` file (+ optional password) and parse it server-side
 *  - `resolve` — per-account + per-category mapping decisions
 *  - `review`  — parse warnings, counts, duplicate review
 *  - `execute` — live job progress
 *  - `done`    — completion summary
 *
 * Every step is always visible; none of them is conditional.
 */
type MsMoneyImportStepKey = 'upload' | 'resolve' | 'review' | 'execute' | 'done';

/** Every step in canonical order. All are always visible. */
const MS_MONEY_STEP_KEYS: readonly MsMoneyImportStepKey[] = ['upload', 'resolve', 'review', 'execute', 'done'];

/** The Money category layout is fixed, so every import shares one remembered-preset key. */
const CATEGORY_PRESET_FINGERPRINT = 'ms-money';

/** i18n key rendering each step's label in the stepper. */
export const MS_MONEY_STEP_LABEL_KEYS: Record<MsMoneyImportStepKey, string> = {
  upload: 'pages.importExport.msMoneyImport.stepper.steps.upload',
  resolve: 'pages.importExport.msMoneyImport.stepper.steps.resolve',
  review: 'pages.importExport.msMoneyImport.stepper.steps.review',
  execute: 'pages.importExport.msMoneyImport.stepper.steps.execute',
  done: 'pages.importExport.msMoneyImport.stepper.steps.done',
};

/**
 * Steps the client stops heartbeating the upload lease on. Enqueuing the job
 * pins the lease to its absolute cap server-side, so refreshing it buys nothing.
 */
export const MS_MONEY_STEPS_WITHOUT_UPLOAD: readonly MsMoneyImportStepKey[] = ['execute', 'done'];

/** Resolves an untyped key (a stepper emit) to a real wizard step, or null. */
export function toMsMoneyImportStepKey({ key }: { key: string }): MsMoneyImportStepKey | null {
  return MS_MONEY_STEP_KEYS.find((stepKey) => stepKey === key) ?? null;
}

/**
 * Store-internal form shape for one account decision. Wider than the wire type
 * (`MsMoneyAccountMappingValue`): a `link-existing` row may not have a target
 * chosen yet, expressed as `accountId: undefined` — the explicit "unselected"
 * state. Using `undefined` (rather than an empty string) keeps the illegal
 * "linked to nothing" state out of the wire shape and lets validity checks key
 * off the explicit state instead of truthiness of a string.
 *
 * Converted to `MsMoneyAccountMappingValue` at submit time; unselected rows are
 * blocked from being posted by `toWireAccountMapping`.
 */
type MsMoneyAccountFormValue =
  | { action: 'create-new'; currencyCode: string; currentBalance: number | null }
  | { action: 'link-existing'; accountId: string | undefined }
  | { action: 'skip' };

/** Form-level account decisions keyed by `MsMoneyParseAccount.originalName`. */
type MsMoneyAccountFormMapping = Record<string, MsMoneyAccountFormValue>;

export const useImportMsMoneyStore = defineStore('import-ms-money', () => {
  const queryClient = useQueryClient();

  // ---- Wizard step state ----

  const {
    currentStepKey,
    completedStepKeys,
    visibleSteps,
    goToStep,
    goNext,
    goBack,
    markStepCompleted,
    reset: resetSteps,
  } = useWizardSteps<MsMoneyImportStepKey>({ stepKeys: MS_MONEY_STEP_KEYS });

  // ---- Core upload state ----

  /**
   * Server-side handle for the parsed upload. A `.mny` database is binary and
   * can run to tens of megabytes, so it is sent once, parsed once, and cached
   * on the server; detect-duplicates and execute send this id instead of the
   * file. The file bytes are never held here.
   */
  const uploadId = ref<string | null>(null);
  /**
   * Expiry of the cached parse result plus the ceiling refreshing cannot pass.
   * Held here so the wizard shell can drive the heartbeat and write the renewed
   * lease straight back.
   */
  const lease = ref<ResourceLease | null>(null);
  const parsedResult = ref<MsMoneyParseResult | null>(null);

  // ---- Account-mapping state ----

  /**
   * Per-account decision keyed by `MsMoneyParseAccount.originalName`. Starts
   * empty after a parse — `prepareResolveStep`'s auto-match makes the initial
   * decisions. Accounts can also be skipped entirely, dropping their rows.
   */
  const accountMapping = ref<MsMoneyAccountFormMapping>({});

  // ---- Category-mapping state ----

  /**
   * Per-category decision keyed by `MsMoneyParseCategory.fullName` (Money's full
   * path, e.g. `"Auto:Gas"`). Each category is created fresh (`create-new`) or
   * mapped onto an existing one (`link-existing`).
   */
  const categoryMapping = ref<CategoryMappingConfig>({});

  // ---- Duplicate-detection state ----

  /** Raw duplicate matches returned by the detect-duplicates endpoint. */
  const duplicates = ref<DuplicateMatch[]>([]);
  /**
   * Row indices the user has "un-marked" (i.e. wants to import anyway despite
   * being detected as a duplicate).
   */
  const unmarkedDuplicateIndices = ref<Set<number>>(new Set());
  /** Row indices that will actually be skipped on execute (all detected
   *  duplicates minus any the user chose to import anyway). */
  const skipDuplicateIndices = computed<number[]>(() =>
    duplicates.value.filter((d) => !unmarkedDuplicateIndices.value.has(d.rowIndex)).map((d) => d.rowIndex),
  );

  // ---- Voided-row opt-in ----

  /**
   * Whether rows Money marks void are imported. Off by default: they never moved
   * money, so leaving them out matches what Money itself shows. Turning it on
   * writes them as zero-amount transactions tagged "Void", keeping their date,
   * payee, category, memo and cheque number.
   */
  const includeVoidedTransactions = ref(false);

  // ---- Progress / execute state ----

  /**
   * SSE + status-poll watchdog for the running import. Owns the live `progress`
   * and the terminal `executeError`. Completion advances the wizard to `done`
   * and refreshes caches; lost contact bounces back to `review` so the user can
   * retry.
   */
  const jobProgress = useImportJobProgress<MsMoneyImportProgress>({
    sseEventType: SSE_EVENT_TYPES.MS_MONEY_IMPORT_PROGRESS,
    fetchStatus: getMsMoneyImportStatus,
    onComplete: async () => {
      markStepCompleted('execute');
      goToStep('done');

      // Invalidate every cached TanStack query so transactions/analytics/balances
      // pick up the just-imported rows.
      queryClient.invalidateQueries();
      // Pinia-backed lists (accounts, categories, tags, currencies) are not
      // wired into TanStack — refetch each one explicitly so sidebars and
      // pickers don't keep their pre-import snapshot. Each refetch is guarded so
      // one failing list neither rejects the handler nor blocks the others.
      await Promise.allSettled([
        useAccountsStore()
          .refetchAccounts()
          .catch((error) => captureException({ error, context: { scope: 'import-ms-money:post-import-accounts' } })),
        useCategoriesStore()
          .loadCategories({ force: true })
          .catch((error) => captureException({ error, context: { scope: 'import-ms-money:post-import-categories' } })),
        useTagsStore()
          .loadTags()
          .catch((error) => captureException({ error, context: { scope: 'import-ms-money:post-import-tags' } })),
        useCurrenciesStore()
          .loadCurrencies({ force: true })
          .catch((error) => captureException({ error, context: { scope: 'import-ms-money:post-import-currencies' } })),
      ]);
    },
    // On failure the wizard stays on the execute step, where the failed status
    // callout (with the server's error message) is rendered.
    onFailure: () => {},
    onLostContact: () => goToStep('review'),
  });
  const progress = jobProgress.progress;

  // Covers the gap between the execute POST being sent and the watchdog being
  // armed (progress is still null at that point).
  const isEnqueuing = ref(false);

  /** True while the import job is enqueuing or in flight (queued/running). Drives
   *  the review-step button's busy state and blocks a second `execute()`. */
  const isExecuting = computed(
    () => isEnqueuing.value || progress.value?.status === 'queued' || progress.value?.status === 'running',
  );

  /**
   * True from the moment a job is enqueued until the user leaves the results
   * behind with `reset()`. The wizard shell keys off this so remounting the page
   * mid-import neither detaches the progress watchdog nor offers a fresh upload
   * that would import the same ledger twice.
   */
  const hasActiveJob = computed(() => isExecuting.value || progress.value !== null);

  // ---- Balance recalculation toggle ----

  // Resolve-step checkbox backed by the persisted `import.recalculateAccountBalance`
  // user setting; the chosen value is PATCHed back after execute accepts the job.
  const {
    recalculateBalance,
    settingsLoading: recalculateBalanceSettingLoading,
    settingsLoadFailed: recalculateBalanceSettingLoadFailed,
    persistRecalculateBalanceSetting,
    resetOverride: resetRecalculateBalanceOverride,
  } = useRecalculateBalanceToggle({ sentryScope: 'import-ms-money:persist-recalculate-balance' });

  // ---- Loading / error flags ----

  /** Server-supplied reason the upload failed (bad file, wrong password, too large). */
  const uploadError = ref<string | null>(null);
  const isUploading = ref(false);
  const isDetectingDuplicates = ref(false);
  const detectError = ref<string | null>(null);
  /** Terminal watchdog error (lost contact / expired job) for the execute step. */
  const executeError = jobProgress.executeError;

  // ---- Resolve helpers feeding the shared resolve engine ----

  /** Detected currency for each source account, keyed by its original name. Rebuilt once per parse result. */
  const accountCurrencyByName = computed<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const account of parsedResult.value?.accounts ?? []) {
      map.set(account.originalName, account.currency);
    }
    return map;
  });

  /** Builds a `create-new` account form value carrying the account's detected currency. */
  const buildAccountCreateNew = ({ currency }: { currency: string | undefined }): MsMoneyAccountFormValue => ({
    action: 'create-new',
    currencyCode: currency ?? '',
    currentBalance: null,
  });

  /** Full category paths — what the resolve step renders and what the wire mapping is keyed by. */
  const resolvableCategoryNames = computed<string[]>(() =>
    (parsedResult.value?.categories ?? []).map((category) => category.fullName),
  );

  /** True once an account form decision is complete (create-new, skip, or linked with a chosen target). */
  const isAccountResolved = (mapping: MsMoneyAccountFormValue | undefined): boolean =>
    mapping?.action === 'create-new' ||
    mapping?.action === 'skip' ||
    (mapping?.action === 'link-existing' && mapping.accountId !== undefined);

  /** True once a category decision is complete (create-new, or linked with a chosen target). */
  const isCategoryResolved = (mapping: CategoryMappingValue | undefined): boolean =>
    mapping?.action === 'create-new' || (mapping?.action === 'link-existing' && !!mapping.categoryId);

  /**
   * Shared resolve engine (bulk actions, resolved counts, step validity,
   * duplicate-unmark toggle). Account create-new entries carry the account's
   * detected currency; the `link-existing` form value uses `undefined` for
   * "no target chosen yet".
   */
  const {
    autoMatchResolveValues,
    quickMapExactMatches,
    quickCreateNewForUnmatched,
    quickAiMapCategories,
    isAiMappingCategories,
    aiMappingCategoriesError,
    resetAiMapping,
    resetResolveEntity,
    toggleDuplicateUnmark,
    accountResolvedCount,
    categoryResolvedCount,
    isResolveStepValid,
  } = useResolveMapping<MsMoneyAccountFormValue, CategoryMappingValue>({
    accounts: {
      isActive: () => true,
      getSources: () =>
        (parsedResult.value?.accounts ?? []).map((account) => ({
          name: account.originalName,
          currencyCode: account.currency || undefined,
        })),
      getTargets: () =>
        useAccountsStore().importLinkableAccounts.map((account) => ({
          id: String(account.id),
          name: account.name,
          currencyCode: account.currencyCode,
        })),
      mapping: accountMapping,
      toLink: (id) => ({ action: 'link-existing', accountId: id }),
      toCreate: (name) => buildAccountCreateNew({ currency: accountCurrencyByName.value.get(name) }),
      isResolved: isAccountResolved,
    },
    categories: {
      isActive: () => true,
      getSources: () => (parsedResult.value?.categories ?? []).map((category) => ({ name: category.fullName })),
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
    unmarkedDuplicateIndices,
  });

  // ---- Remembered category mappings ----

  const {
    matchingPreset: matchingCategoryPreset,
    namedPresets: namedCategoryPresets,
    applyPreset,
    persistPreset: persistCategoryPreset,
    renamePreset: renameCategoryPreset,
    deletePreset: deleteCategoryPreset,
  } = useCategoryMappingPresets({ fingerprint: ref(CATEGORY_PRESET_FINGERPRINT) });

  const applyCategoryPreset = ({ preset }: { preset: CategoryMappingPreset }) =>
    applyPreset({ preset, categoryMapping, validSourceNames: resolvableCategoryNames.value });

  /** True when at least one account is mapped to an existing app account.
   *  Determines whether duplicate detection is meaningful. */
  const hasAnyLinkExisting = computed(() =>
    Object.values(accountMapping.value).some((m) => m.action === 'link-existing'),
  );

  /** Source accounts the user chose to leave out of the import. */
  const skippedAccountNames = computed<string[]>(() =>
    Object.entries(accountMapping.value)
      .filter(([, value]) => value.action === 'skip')
      .map(([name]) => name),
  );

  // ---- Per-row mapping setters (consumed by the shared mapping tables) ----

  /**
   * Switches one account's action. `create-new` carries the account's detected
   * currency + a null balance; `link-existing` starts unselected (no target id)
   * until the user picks one; `skip` drops the account and its rows.
   */
  function setAccountAction({ name, action }: { name: string; action: 'create-new' | 'link-existing' | 'skip' }): void {
    if (action === 'create-new') {
      accountMapping.value[name] = buildAccountCreateNew({ currency: accountCurrencyByName.value.get(name) });
    } else if (action === 'link-existing') {
      accountMapping.value[name] = { action: 'link-existing', accountId: undefined };
    } else {
      accountMapping.value[name] = { action: 'skip' };
    }
  }

  /**
   * Sets the link target for one account. A cleared picker (empty id) returns the
   * row to the unselected `link-existing` state so the resolve step stays invalid
   * until a target is chosen.
   */
  function setAccountTarget({ name, accountId }: { name: string; accountId: string }): void {
    accountMapping.value[name] = { action: 'link-existing', accountId: accountId || undefined };
  }

  /**
   * Sets the desired post-import balance for a `create-new` account. Pass
   * `null` to leave the balance equal to the sum of imported transactions.
   * Decimals only — the frontend never works in cents.
   */
  function setAccountCurrentBalance({ name, currentBalance }: { name: string; currentBalance: number | null }): void {
    const existing = accountMapping.value[name];
    if (existing?.action === 'create-new') {
      existing.currentBalance = currentBalance;
    }
  }

  /** Switches one category's action (`create-new` or link-existing with an empty id). */
  function setCategoryAction({ name, action }: { name: string; action: 'create-new' | 'link-existing' }): void {
    if (action === 'create-new') {
      categoryMapping.value[name] = { action: 'create-new' };
    } else {
      categoryMapping.value[name] = { action: 'link-existing', categoryId: '' };
    }
  }

  /** Sets the link target for one category. An empty id keeps the row unresolved. */
  function setCategoryTarget({ name, categoryId }: { name: string; categoryId: string }): void {
    categoryMapping.value[name] = { action: 'link-existing', categoryId };
  }

  /**
   * Readies the resolve step: ensures the existing categories + accounts lists
   * (the link targets) are loaded, then runs a non-destructive auto-match. Each
   * fetch is independently guarded so a single failure neither aborts the rest
   * nor rejects the caller.
   */
  async function prepareResolveStep(): Promise<void> {
    const accountsStore = useAccountsStore();
    const categoriesStore = useCategoriesStore();

    const tasks: Promise<unknown>[] = [];

    if (categoriesStore.categories.length === 0) {
      tasks.push(
        categoriesStore.loadCategories().catch((error) => {
          captureException({ error, context: { scope: 'import-ms-money:load-categories' } });
        }),
      );
    }

    if (!accountsStore.isAccountsFetched) {
      tasks.push(
        accountsStore.refetchAccounts().catch((error) => {
          captureException({ error, context: { scope: 'import-ms-money:load-accounts' } });
        }),
      );
    }

    await Promise.allSettled(tasks);

    autoMatchResolveValues({ overwrite: false });
  }

  // ---- Submit-time conversion ----

  /**
   * Projects the store-internal account form mapping to the wire shape. Every
   * `link-existing` row must have a chosen target by this point (`isResolveStepValid`
   * gates the UI); an unselected one is a programming error, so this throws rather
   * than silently posting an account linked to nothing.
   */
  function toWireAccountMapping(): MsMoneyAccountMapping {
    const wire: MsMoneyAccountMapping = {};
    for (const [name, value] of Object.entries(accountMapping.value)) {
      if (value.action === 'link-existing') {
        if (value.accountId === undefined) {
          throw new Error(`Account "${name}" is set to link to an existing account but no target was selected.`);
        }
        wire[name] = { action: 'link-existing', accountId: value.accountId };
      } else {
        wire[name] = value;
      }
    }
    return wire;
  }

  /**
   * Projects the category mapping to the wire shape. A `link-existing` row with
   * an empty `categoryId` is the unselected state `isResolveStepValid` gates on,
   * so reaching submit with one is a programming error — throw instead of posting
   * a category linked to nothing.
   */
  function toWireCategoryMapping(): CategoryMappingConfig {
    const wire: CategoryMappingConfig = {};
    for (const [name, value] of Object.entries(categoryMapping.value)) {
      if (value.action === 'link-existing' && !value.categoryId) {
        throw new Error(`Category "${name}" is set to link to an existing category but no target was selected.`);
      }
      wire[name] = value;
    }
    return wire;
  }

  // ---- Async actions ----

  /**
   * Sends the file to the server, which parses it and caches the result under an
   * `uploadId`. `password` is only needed for files the user protected in
   * Microsoft Money; it is passed through to the decryption step and not stored.
   */
  async function uploadFile({ file, password }: { file: File; password?: string }): Promise<void> {
    isUploading.value = true;
    uploadError.value = null;
    // A bounce back to this step leaves its reason on screen; a new upload
    // replaces the whole run, so those messages must not follow it forward.
    detectError.value = null;
    jobProgress.setExecuteError(null);

    try {
      const response = await uploadMsMoneyFile({ file, password });

      uploadId.value = response.uploadId;
      lease.value = response.lease;
      parsedResult.value = response.result;

      // Left empty so `prepareResolveStep`'s auto-match decides each row. Seeding
      // create-new here is the abolished alternative: auto-match runs with
      // `overwrite: false`, so a pre-seed would pin every row at create-new.
      accountMapping.value = {};
      categoryMapping.value = {};

      markStepCompleted('upload');
      goToStep('resolve');
      await prepareResolveStep();
    } catch (err) {
      uploadError.value = getErrorMessage(err, i18n.global.t('errors.api.unexpectedError'));
      throw err;
    } finally {
      isUploading.value = false;
    }
  }

  /**
   * Pushes the cached parse result's expiry back. Resolves to `null` when there
   * is nothing cached, so the caller's heartbeat stops instead of polling for a
   * resource that was never there.
   */
  async function refreshLease(): Promise<ResourceLease | null> {
    if (!uploadId.value) return null;

    const next = await refreshResourceLease({ type: ResourceLeaseType.msMoneyUpload, id: uploadId.value });
    lease.value = next;
    return next;
  }

  /**
   * Calls the detect-duplicates endpoint if at least one account maps to an
   * existing account (otherwise there is nothing to detect against and
   * duplicates are cleared immediately), then advances to the review step.
   */
  async function detectDuplicates(): Promise<void> {
    if (!uploadId.value) {
      // The cached parse result is gone — there is nothing to detect against.
      // Surface a real error and send the user back to re-upload rather than
      // silently doing nothing.
      detectError.value = i18n.global.t('pages.importExport.msMoneyImport.errors.uploadUnavailable');
      goToStep('upload');
      return;
    }

    if (!hasAnyLinkExisting.value) {
      duplicates.value = [];
      unmarkedDuplicateIndices.value = new Set();
      markStepCompleted('resolve');
      goToStep('review');
      return;
    }

    isDetectingDuplicates.value = true;
    detectError.value = null;
    try {
      const response = await apiDetectMsMoneyDuplicates({
        uploadId: uploadId.value,
        accountMapping: toWireAccountMapping(),
      });
      duplicates.value = response.duplicates;
      unmarkedDuplicateIndices.value = new Set();
      markStepCompleted('resolve');
      goToStep('review');
    } catch (err) {
      detectError.value = getErrorMessage(err, i18n.global.t('errors.api.unexpectedError'));
      throw err;
    } finally {
      isDetectingDuplicates.value = false;
    }
  }

  async function execute(): Promise<void> {
    // The completed `review` step stays clickable while the job runs, so the Import
    // button can be reached a second time; a second enqueue imports everything twice.
    if (isExecuting.value) return;

    if (!uploadId.value) {
      // The cached parse result is gone — the job cannot be started. Surface a
      // real error and send the user back to re-upload rather than silently
      // doing nothing when they click Import.
      jobProgress.setExecuteError(i18n.global.t('pages.importExport.msMoneyImport.errors.uploadUnavailable'));
      goToStep('upload');
      return;
    }
    jobProgress.setExecuteError(null);

    isEnqueuing.value = true;
    let categoryMappingPayload: CategoryMappingConfig;
    let response: Awaited<ReturnType<typeof executeMsMoneyImport>>;
    try {
      categoryMappingPayload = toWireCategoryMapping();
      response = await executeMsMoneyImport({
        uploadId: uploadId.value,
        accountMapping: toWireAccountMapping(),
        categoryMapping: categoryMappingPayload,
        skipDuplicateIndices: skipDuplicateIndices.value,
        includeVoidedTransactions: includeVoidedTransactions.value,
        recalculateBalance: recalculateBalance.value,
      });
    } catch (err) {
      // The call never started the job — keep the user on `review` (not marked
      // complete) so they can correct the input and retry.
      jobProgress.setExecuteError(getErrorMessage(err, i18n.global.t('errors.api.unexpectedError')));
      return;
    } finally {
      isEnqueuing.value = false;
    }

    // Job accepted: remember the balance-recalculation choice for the next
    // import (fire-and-forget), then advance the wizard and arm the watchdog.
    persistRecalculateBalanceSetting();
    persistCategoryPreset({ mapping: categoryMappingPayload });
    markStepCompleted('review');
    goToStep('execute');
    jobProgress.start({
      initialProgress: {
        jobId: response.jobId,
        status: 'queued',
        processedCount: 0,
        totalCount: 0,
      },
    });
  }

  function reset(): void {
    uploadId.value = null;
    lease.value = null;
    parsedResult.value = null;
    accountMapping.value = {};
    categoryMapping.value = {};
    duplicates.value = [];
    unmarkedDuplicateIndices.value = new Set();
    includeVoidedTransactions.value = false;
    resetRecalculateBalanceOverride();
    progress.value = null;
    resetSteps();
    uploadError.value = null;
    isUploading.value = false;
    isDetectingDuplicates.value = false;
    detectError.value = null;
    isEnqueuing.value = false;
    resetAiMapping();
    jobProgress.setExecuteError(null);
    jobProgress.stop();
  }

  return {
    // State
    uploadId,
    lease,
    parsedResult,
    accountMapping,
    categoryMapping,
    duplicates,
    unmarkedDuplicateIndices,
    includeVoidedTransactions,
    progress,
    currentStepKey,
    completedStepKeys,
    uploadError,
    isUploading,
    isDetectingDuplicates,
    detectError,
    executeError,

    // Getters
    isExecuting,
    hasActiveJob,
    visibleSteps,
    accountResolvedCount,
    categoryResolvedCount,
    resolvableCategoryNames,
    matchingCategoryPreset,
    namedCategoryPresets,
    isResolveStepValid,
    hasAnyLinkExisting,
    skippedAccountNames,
    skipDuplicateIndices,
    recalculateBalance,
    recalculateBalanceSettingLoading,
    recalculateBalanceSettingLoadFailed,

    // Step navigation
    goToStep,
    goNext,
    goBack,
    markStepCompleted,
    prepareResolveStep,

    // Per-row mapping setters
    setAccountAction,
    setAccountTarget,
    setAccountCurrentBalance,
    setCategoryAction,
    setCategoryTarget,

    // Bulk actions
    autoMatchResolveValues,
    quickMapExactMatches,
    quickCreateNewForUnmatched,
    quickAiMapCategories,
    isAiMappingCategories,
    aiMappingCategoriesError,
    resetResolveEntity,
    applyCategoryPreset,
    renameCategoryPreset,
    deleteCategoryPreset,

    // Duplicate helpers
    toggleDuplicateUnmark,

    // Actions
    uploadFile,
    refreshLease,
    detectDuplicates,
    execute,
    reset,
  };
});
