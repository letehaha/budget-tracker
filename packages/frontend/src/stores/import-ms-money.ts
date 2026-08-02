import {
  detectMsMoneyDuplicates as apiDetectMsMoneyDuplicates,
  executeMsMoneyImport,
  getMsMoneyImportStatus,
  uploadMsMoneyFile,
} from '@/api/import-ms-money';
import { refreshResourceLease } from '@/api/resource-leases';
import { useImportJobProgress } from '@/composable/use-import-job-progress';
import { useRecalculateBalanceToggle } from '@/composable/use-recalculate-balance-toggle';
import { useResolveMapping } from '@/composable/use-resolve-mapping';
import { useWizardSteps } from '@/composable/use-wizard-steps';
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
export type MsMoneyImportStepKey = 'upload' | 'resolve' | 'review' | 'execute' | 'done';

/** Every step in canonical order. All are always visible. */
const ALL_STEP_KEYS: readonly MsMoneyImportStepKey[] = ['upload', 'resolve', 'review', 'execute', 'done'];

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
  } = useWizardSteps<MsMoneyImportStepKey>({ stepKeys: ALL_STEP_KEYS });

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
  /** Name of the uploaded file, kept only so the wizard can show what is being imported. */
  const uploadedFileName = ref<string | null>(null);
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

  // ---- Async actions ----

  /**
   * Sends the file to the server, which parses it and caches the result under an
   * `uploadId`. `password` is only needed for files the user protected in
   * Microsoft Money; it is passed through to the decryption step and not stored.
   */
  async function uploadFile({ file, password }: { file: File; password?: string }): Promise<void> {
    isUploading.value = true;
    uploadError.value = null;

    try {
      const response = await uploadMsMoneyFile({ file, password });

      uploadId.value = response.uploadId;
      lease.value = response.lease;
      uploadedFileName.value = file.name;
      parsedResult.value = response.result;

      // Start both mappings empty and let `prepareResolveStep`'s auto-match make the
      // initial decisions: every account/category whose name exactly matches an
      // existing one links to it, and the rest fall back to create-new (accounts
      // carrying their detected currency, via the `toCreate` factory). Seeding to
      // create-new here is the abolished alternative — auto-match runs with
      // `overwrite: false` and skips rows that already hold a decision, so a
      // pre-seed would pin every row at create-new until the user manually clicked
      // "Map exact matches".
      accountMapping.value = {};
      categoryMapping.value = {};

      markStepCompleted('upload');
      goToStep('resolve');
      await prepareResolveStep();
    } catch (err) {
      uploadError.value = err instanceof Error ? err.message : 'Unknown error';
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
      detectError.value = 'The uploaded file is no longer available. Please upload your Money file again.';
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
      detectError.value = err instanceof Error ? err.message : 'Unknown error';
      throw err;
    } finally {
      isDetectingDuplicates.value = false;
    }
  }

  async function execute(): Promise<void> {
    if (!uploadId.value) {
      // The cached parse result is gone — the job cannot be started. Surface a
      // real error and send the user back to re-upload rather than silently
      // doing nothing when they click Import.
      jobProgress.setExecuteError('The uploaded file is no longer available. Please upload your Money file again.');
      goToStep('upload');
      return;
    }
    jobProgress.setExecuteError(null);

    let response: Awaited<ReturnType<typeof executeMsMoneyImport>>;
    try {
      response = await executeMsMoneyImport({
        uploadId: uploadId.value,
        accountMapping: toWireAccountMapping(),
        categoryMapping: categoryMapping.value,
        skipDuplicateIndices: skipDuplicateIndices.value,
        recalculateBalance: recalculateBalance.value,
      });
    } catch (err) {
      // The call never started the job — keep the user on `review` (not marked
      // complete) so they can correct the input and retry.
      jobProgress.setExecuteError(err instanceof Error ? err.message : 'Unknown error');
      return;
    }

    // Job accepted: remember the balance-recalculation choice for the next
    // import (fire-and-forget), then advance the wizard and arm the watchdog.
    persistRecalculateBalanceSetting();
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
    uploadedFileName.value = null;
    parsedResult.value = null;
    accountMapping.value = {};
    categoryMapping.value = {};
    duplicates.value = [];
    unmarkedDuplicateIndices.value = new Set();
    resetRecalculateBalanceOverride();
    progress.value = null;
    resetSteps();
    uploadError.value = null;
    isUploading.value = false;
    isDetectingDuplicates.value = false;
    detectError.value = null;
    jobProgress.setExecuteError(null);
    jobProgress.stop();
  }

  return {
    // State
    uploadId,
    lease,
    uploadedFileName,
    parsedResult,
    accountMapping,
    categoryMapping,
    duplicates,
    unmarkedDuplicateIndices,
    progress,
    currentStepKey,
    completedStepKeys,
    uploadError,
    isUploading,
    isDetectingDuplicates,
    detectError,
    executeError,

    // Getters
    visibleSteps,
    accountResolvedCount,
    categoryResolvedCount,
    resolvableCategoryNames,
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
    resetResolveEntity,

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
