import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const/vue-query';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Ref, defineComponent, ref } from 'vue';

import { useImportExportStore } from './import-export';

// ----- module mocks -----

// The store does `await import('@/api/import-export')` inside its action, so we
// mock the module statically here and Vitest intercepts the dynamic import too.
vi.mock('@/api/import-export', () => ({
  detectDuplicates: vi.fn(),
  parseCsv: vi.fn(),
  extractUniqueValues: vi.fn(),
  executeImport: vi.fn(),
  getCsvImportStatus: vi.fn(),
}));

// The execute action is now asynchronous: it enqueues a BullMQ job and arms the
// `useImportJobProgress` watchdog (SSE + status poll). The watchdog is mocked so
// the test controls the async boundary deterministically instead of driving real
// timers/SSE. The mock captures the config object the store passes at
// construction time, so a test can later invoke the real onComplete/onFailure/
// onLostContact callbacks to drive completion/failure and assert side-effects.
type ImportJobProgressConfig = Parameters<
  typeof import('@/composable/use-import-job-progress').useImportJobProgress
>[0];

let capturedJobProgressConfig: ImportJobProgressConfig | null = null;
let mockJobProgressStart: ReturnType<typeof vi.fn>;
let mockJobProgressStop: ReturnType<typeof vi.fn>;
let mockJobProgressSetExecuteError: ReturnType<typeof vi.fn>;
let mockJobProgress: Ref<unknown>;
let mockJobExecuteError: Ref<string | null>;

vi.mock('@/composable/use-import-job-progress', () => ({
  useImportJobProgress: vi.fn((config: ImportJobProgressConfig) => {
    capturedJobProgressConfig = config;
    return {
      progress: mockJobProgress,
      executeError: mockJobExecuteError,
      setExecuteError: mockJobProgressSetExecuteError,
      start: mockJobProgressStart,
      stop: mockJobProgressStop,
    };
  }),
}));

// useQueryClient is called at store construction time. We keep a reference to the
// shared QueryClient so tests can spy on it (the store captures it at init time,
// so everyone must share the same instance).
let sharedQueryClient: QueryClient;

vi.mock('@tanstack/vue-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/vue-query')>();
  return {
    ...actual,
    useQueryClient: vi.fn(() => sharedQueryClient),
  };
});

vi.mock('./onboarding', () => ({
  useOnboardingStore: vi.fn(() => ({ completeTask: vi.fn() })),
}));

vi.mock('./categories/categories', () => ({
  useCategoriesStore: vi.fn(() => ({ loadCategories: vi.fn() })),
}));

// onComplete refreshes the Pinia tags store when the import created tags; mock it
// so a completed payload with tagsCreated > 0 doesn't reach the real store.
vi.mock('./tags', () => ({
  useTagsStore: vi.fn(() => ({ loadTags: vi.fn() })),
}));

// ----- helpers -----

import * as apiModule from '@/api/import-export';
import {
  AccountOptionValue,
  CategoryOptionValue,
  type CsvImportSummary,
  CurrencyOptionValue,
  type DetectDuplicatesResponse,
  type ExecuteImportResponse,
  type SourceAccount,
  TagOptionValue,
  TransactionTypeOptionValue,
} from '@bt/shared/types';

import { useCategoriesStore } from './categories/categories';

const mockDetectDuplicatesApi = vi.mocked(apiModule.detectDuplicates);
const mockExecuteImportApi = vi.mocked(apiModule.executeImport);

/** Async execute now resolves to a bare job id; the summary arrives later over the watchdog. */
const EXECUTE_RESPONSE: ExecuteImportResponse = { jobId: 'job-1' };

/**
 * Builds a terminal `completed` watchdog payload. The store's onComplete reads
 * only `summary.*Created` counters, so the rest of the summary is filled with
 * neutral defaults that each test can override.
 */
const completedPayload = (summary: Partial<CsvImportSummary> = {}) => ({
  jobId: 'job-1',
  status: 'completed' as const,
  processedCount: 0,
  totalCount: 0,
  summary: {
    imported: 0,
    skipped: 0,
    skippedUnpriceable: 0,
    accountsCreated: 0,
    categoriesCreated: 0,
    tagsCreated: 0,
    payeesCreated: 0,
    errors: [],
    newTransactionIds: [],
    batchId: 'batch-1',
    ...summary,
  } satisfies CsvImportSummary,
});

/** Invokes the onComplete callback the store registered with the mocked watchdog. */
const fireOnComplete = async (summary: Partial<CsvImportSummary> = {}) => {
  // The store always constructs the watchdog at init, so config is captured.
  await capturedJobProgressConfig!.onComplete(completedPayload(summary) as never);
};

/** Mount a minimal component so Pinia + VueQuery plugins are active. */
const mountWithPlugins = () => {
  // Create a fresh shared client before each test so spies start clean.
  sharedQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  // Reset the mocked watchdog before the store is constructed so each test gets
  // its own spies, fresh refs, and a freshly-captured config.
  capturedJobProgressConfig = null;
  mockJobProgressStart = vi.fn();
  mockJobProgressStop = vi.fn();
  mockJobProgressSetExecuteError = vi.fn((message: string | null) => {
    mockJobExecuteError.value = message;
  });
  mockJobProgress = ref(null);
  mockJobExecuteError = ref<string | null>(null);

  const pinia = createPinia();
  setActivePinia(pinia);

  const Wrapper = defineComponent({ setup() {}, template: '<div />' });
  mount(Wrapper, {
    global: { plugins: [pinia, [VueQueryPlugin, { queryClient: sharedQueryClient }]] },
  });
};

const BASE_RESPONSE: DetectDuplicatesResponse = {
  validRows: [],
  invalidRows: [],
  duplicates: [],
};

// Minimum column mapping to satisfy store's non-null assertions
const seedStore = (store: ReturnType<typeof useImportExportStore>) => {
  store.fileContent = 'date,amount\n2026-01-01,100';
  store.columnMapping.date = 'date';
  store.columnMapping.amount = 'amount';
  store.columnMapping.currency = { option: 'existing-currency' as never, currencyCode: 'USD' };
  store.columnMapping.account = { option: 'existing-account' as never, accountId: 'acc-1' };
  store.columnMapping.category = { option: 'existing-category' as never, categoryId: 'cat-1' };
  store.columnMapping.transactionType = { option: 'amount-sign' as never };
};

// ----- tests -----

describe('useImportExportStore – detectDuplicates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  it('sends the browser timezone in the request payload', async () => {
    mockDetectDuplicatesApi.mockResolvedValue(BASE_RESPONSE);

    const store = useImportExportStore();
    seedStore(store);

    await store.detectDuplicates();

    const resolvedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(mockDetectDuplicatesApi).toHaveBeenCalledWith(expect.objectContaining({ timezone: resolvedTimezone }));
    expect(resolvedTimezone.length).toBeGreaterThan(0);
  });

  it('stores dateColumnError when the response includes one and does not advance step', async () => {
    const errorResponse: DetectDuplicatesResponse = {
      ...BASE_RESPONSE,
      dateColumnError: {
        column: 'date',
        reason: 'mixed',
        message: 'The date column has mixed day/month order.',
      },
    };
    mockDetectDuplicatesApi.mockResolvedValue(errorResponse);

    const store = useImportExportStore();
    seedStore(store);
    store.currentStep = 2;

    await store.detectDuplicates();

    expect(store.dateColumnError).toEqual(errorResponse.dateColumnError);
    // Step must NOT advance when date column error is present.
    expect(store.currentStep).toBe(2);
  });

  it('clears a prior dateColumnError on a successful re-run', async () => {
    // First call: produces an error
    mockDetectDuplicatesApi.mockResolvedValueOnce({
      ...BASE_RESPONSE,
      dateColumnError: { column: 'date', reason: 'mixed', message: 'Ambiguous dates.' },
    });
    // Second call: clean response
    mockDetectDuplicatesApi.mockResolvedValueOnce(BASE_RESPONSE);

    const store = useImportExportStore();
    seedStore(store);

    await store.detectDuplicates();
    expect(store.dateColumnError).not.toBeNull();

    await store.detectDuplicates();
    expect(store.dateColumnError).toBeNull();
  });

  it('advances to step 3 when there is no dateColumnError', async () => {
    mockDetectDuplicatesApi.mockResolvedValue(BASE_RESPONSE);

    const store = useImportExportStore();
    seedStore(store);
    store.currentStep = 2;

    await store.detectDuplicates();

    expect(store.dateColumnError).toBeNull();
    expect(store.currentStep).toBe(3);
  });

  it('reset clears dateColumnError', () => {
    const store = useImportExportStore();
    store.dateColumnError = { column: 'date', reason: 'mixed', message: 'Mixed.' };

    store.reset();

    expect(store.dateColumnError).toBeNull();
  });

  // N-5: network error — loading resets, detect-error state set, step does not advance
  it('resets isDetectingDuplicates and sets detectError when the API rejects, step stays unchanged', async () => {
    const networkError = new Error('Network failure');
    mockDetectDuplicatesApi.mockRejectedValue(networkError);

    const store = useImportExportStore();
    seedStore(store);
    store.currentStep = 2;

    await expect(store.detectDuplicates()).rejects.toThrow('Network failure');

    expect(store.isDetectingDuplicates).toBe(false);
    expect(store.detectError).not.toBeNull();
    expect(store.currentStep).toBe(2);
  });

  // N-5: after error→success the step advances and validRows is populated
  it('clears detectError, advances step, and populates validRows on successful re-run after network error', async () => {
    const networkError = new Error('Network failure');
    mockDetectDuplicatesApi.mockRejectedValueOnce(networkError);

    const successResponse: DetectDuplicatesResponse = {
      ...BASE_RESPONSE,
      validRows: [{ rowIndex: 0, date: '2026-01-01T00:00:00Z', amount: 100, description: 'Coffee' } as never],
    };
    mockDetectDuplicatesApi.mockResolvedValueOnce(successResponse);

    const store = useImportExportStore();
    seedStore(store);
    store.currentStep = 2;

    // First call: network error
    await expect(store.detectDuplicates()).rejects.toThrow('Network failure');
    expect(store.detectError).not.toBeNull();
    expect(store.currentStep).toBe(2);

    // Second call: success
    await store.detectDuplicates();

    expect(store.detectError).toBeNull();
    expect(store.currentStep).toBe(3);
    expect(store.validRows).toHaveLength(1);
  });
});

describe('useImportExportStore – unpriceableRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  it('stores unpriceableRows from the detect response', async () => {
    const response: DetectDuplicatesResponse = {
      ...BASE_RESPONSE,
      unpriceableRows: [
        { rowIndex: 3, currencyCode: 'CZK' },
        { rowIndex: 7, currencyCode: 'PLN' },
      ],
    };
    mockDetectDuplicatesApi.mockResolvedValue(response);

    const store = useImportExportStore();
    seedStore(store);

    await store.detectDuplicates();

    expect(store.unpriceableRows).toEqual([
      { rowIndex: 3, currencyCode: 'CZK' },
      { rowIndex: 7, currencyCode: 'PLN' },
    ]);
  });

  it('defaults unpriceableRows to [] when the field is absent from the detect response', async () => {
    mockDetectDuplicatesApi.mockResolvedValue(BASE_RESPONSE);

    const store = useImportExportStore();
    seedStore(store);

    await store.detectDuplicates();

    expect(store.unpriceableRows).toEqual([]);
  });

  it('clears unpriceableRows at the start of each detect run so stale state does not linger', async () => {
    // First run returns unpriceable rows
    mockDetectDuplicatesApi.mockResolvedValueOnce({
      ...BASE_RESPONSE,
      unpriceableRows: [{ rowIndex: 1, currencyCode: 'CZK' }],
    });
    // Second run returns a clean response (no unpriceableRows field)
    mockDetectDuplicatesApi.mockResolvedValueOnce(BASE_RESPONSE);

    const store = useImportExportStore();
    seedStore(store);

    await store.detectDuplicates();
    expect(store.unpriceableRows).toHaveLength(1);

    await store.detectDuplicates();
    expect(store.unpriceableRows).toHaveLength(0);
  });

  it('reset clears unpriceableRows', async () => {
    mockDetectDuplicatesApi.mockResolvedValue({
      ...BASE_RESPONSE,
      unpriceableRows: [{ rowIndex: 2, currencyCode: 'HUF' }],
    });

    const store = useImportExportStore();
    seedStore(store);
    await store.detectDuplicates();
    expect(store.unpriceableRows).toHaveLength(1);

    store.reset();

    expect(store.unpriceableRows).toHaveLength(0);
  });
});

describe('useImportExportStore – executeImport async payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  it('passes skipUnpriceableIndices to the API on the skip path', async () => {
    mockDetectDuplicatesApi.mockResolvedValue({
      ...BASE_RESPONSE,
      unpriceableRows: [
        { rowIndex: 3, currencyCode: 'CZK' },
        { rowIndex: 7, currencyCode: 'PLN' },
      ],
    });
    mockExecuteImportApi.mockResolvedValue(EXECUTE_RESPONSE);

    const store = useImportExportStore();
    seedStore(store);
    await store.detectDuplicates();

    await store.executeImport({ skipUnpriceableIndices: [3, 7] });

    expect(mockExecuteImportApi).toHaveBeenCalledWith(expect.objectContaining({ skipUnpriceableIndices: [3, 7] }));
  });

  it('omits skipUnpriceableIndices from the API payload when not provided (normal import path)', async () => {
    mockDetectDuplicatesApi.mockResolvedValue(BASE_RESPONSE);
    mockExecuteImportApi.mockResolvedValue(EXECUTE_RESPONSE);

    const store = useImportExportStore();
    seedStore(store);
    await store.detectDuplicates();

    await store.executeImport();

    expect(mockExecuteImportApi).toHaveBeenCalledWith(expect.objectContaining({ skipUnpriceableIndices: undefined }));
  });

  it('sends the async payload (raw fileContent + mapping + timezone), never pre-parsed validRows', async () => {
    mockDetectDuplicatesApi.mockResolvedValue(BASE_RESPONSE);
    mockExecuteImportApi.mockResolvedValue(EXECUTE_RESPONSE);

    const store = useImportExportStore();
    seedStore(store);
    await store.detectDuplicates();

    await store.executeImport();

    const payload = mockExecuteImportApi.mock.calls[0]![0];
    // The worker re-parses server-side, so the request carries the raw file + the
    // built columnMapping config, the per-entity mappings, the skip indices, and
    // the browser timezone — but NOT pre-parsed validRows or the removed
    // defaultAccountId / defaultCategoryId (the backend derives those now).
    expect(payload).toEqual(
      expect.objectContaining({
        fileContent: store.fileContent,
        delimiter: store.detectedDelimiter,
        columnMapping: expect.any(Object),
        accountMapping: store.accountMapping,
        categoryMapping: store.categoryMapping,
        skipDuplicateIndices: expect.any(Array),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    );
    expect(payload).not.toHaveProperty('validRows');
    expect(payload).not.toHaveProperty('defaultAccountId');
    expect(payload).not.toHaveProperty('defaultCategoryId');
  });

  it('arms the progress watchdog with the returned jobId and advances the wizard to results', async () => {
    mockDetectDuplicatesApi.mockResolvedValue(BASE_RESPONSE);
    mockExecuteImportApi.mockResolvedValue({ jobId: 'job-xyz' });

    const store = useImportExportStore();
    seedStore(store);
    await store.detectDuplicates();

    await store.executeImport();

    // Job accepted: the watchdog is started with the server's jobId seeded into
    // the initial (queued) progress, and the wizard moves to the results step.
    expect(mockJobProgressStart).toHaveBeenCalledWith({
      initialProgress: expect.objectContaining({ jobId: 'job-xyz', status: 'queued' }),
    });
    expect(store.currentStepKey).toBe('results');
  });
});

describe('useImportExportStore – import completion cache invalidation', () => {
  // Cache invalidation no longer runs inline in executeImport — it runs in the
  // watchdog's onComplete when the job reports `completed`. These tests drive that
  // callback directly via the captured config.
  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  it('invalidates transactionChange-prefixed queries on job completion', async () => {
    const invalidateSpy = vi.spyOn(sharedQueryClient, 'invalidateQueries');

    useImportExportStore();
    await fireOnComplete();

    // All transaction-change queries (widgets, analytics, records, accounts, balances, etc.)
    // must be invalidated so views reflect newly imported transactions.
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] }),
    );
  });

  it('invalidates currencies-prefixed queries on job completion', async () => {
    const invalidateSpy = vi.spyOn(sharedQueryClient, 'invalidateQueries');

    useImportExportStore();
    await fireOnComplete();

    // Import can connect new user currencies; invalidate the whole currencies prefix
    // so userCurrencies, allCurrencies, baseCurrency and rate queries all refresh.
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.currencies] }),
    );
  });

  it('invalidates categoriesByAccount queries on job completion', async () => {
    const invalidateSpy = vi.spyOn(sharedQueryClient, 'invalidateQueries');

    useImportExportStore();
    await fireOnComplete();

    // Import can create new categories; categoriesByAccount has no prefix so it
    // must be explicitly invalidated (not covered by transactionChange).
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: VUE_QUERY_CACHE_KEYS.categoriesByAccount }),
    );
  });

  it('does not invalidate caches when enqueuing the job fails (no completion)', async () => {
    mockDetectDuplicatesApi.mockResolvedValue(BASE_RESPONSE);
    mockExecuteImportApi.mockRejectedValue(new Error('Import failed'));

    const invalidateSpy = vi.spyOn(sharedQueryClient, 'invalidateQueries');

    const store = useImportExportStore();
    seedStore(store);
    await store.detectDuplicates();

    // The enqueue failure is handled internally (no re-throw) and the job never
    // reaches `completed`, so onComplete never runs and nothing is invalidated.
    await store.executeImport();

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useImportExportStore – categories store refresh on completion', () => {
  // The conditional loadCategories refresh moved into the watchdog's onComplete,
  // gated on summary.categoriesCreated. Drive that callback to exercise it.
  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  it('calls loadCategories when the completed import created new categories', async () => {
    const mockLoadCategories = vi.fn();
    vi.mocked(useCategoriesStore).mockReturnValue({ loadCategories: mockLoadCategories } as never);

    useImportExportStore();
    await fireOnComplete({ categoriesCreated: 2 });

    // The Pinia categories store is not VueQuery-backed, so invalidateQueries
    // alone won't refresh it — loadCategories must be called explicitly so
    // newly-created categories appear in pickers without a full page reload.
    expect(mockLoadCategories).toHaveBeenCalledOnce();
  });

  it('does not call loadCategories when no categories were created', async () => {
    const mockLoadCategories = vi.fn();
    vi.mocked(useCategoriesStore).mockReturnValue({ loadCategories: mockLoadCategories } as never);

    useImportExportStore();
    await fireOnComplete({ categoriesCreated: 0 });

    expect(mockLoadCategories).not.toHaveBeenCalled();
  });

  it('does not call loadCategories when enqueuing the job fails (no completion)', async () => {
    mockDetectDuplicatesApi.mockResolvedValue(BASE_RESPONSE);
    mockExecuteImportApi.mockRejectedValue(new Error('Import failed'));

    const mockLoadCategories = vi.fn();
    vi.mocked(useCategoriesStore).mockReturnValue({ loadCategories: mockLoadCategories } as never);

    const store = useImportExportStore();
    seedStore(store);
    await store.detectDuplicates();

    // Enqueue failure short-circuits before the job exists, so onComplete (and
    // therefore the categories refresh) never runs.
    await store.executeImport();

    expect(mockLoadCategories).not.toHaveBeenCalled();
  });
});

describe('useImportExportStore – executeImport tagMapping inclusion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  it('includes tagMapping in the request when a tags column is mapped', async () => {
    mockDetectDuplicatesApi.mockResolvedValue(BASE_RESPONSE);
    mockExecuteImportApi.mockResolvedValue(EXECUTE_RESPONSE);

    const store = useImportExportStore();
    seedStore(store);
    store.columnMapping.tags = { option: 'map-data-source-column' as never, columnName: 'labels' };
    store.tagMapping = { Food: { action: 'create-new' } };
    await store.detectDuplicates();

    await store.executeImport();

    expect(mockExecuteImportApi).toHaveBeenCalledWith(
      expect.objectContaining({ tagMapping: { Food: { action: 'create-new' } } }),
    );
  });

  // Regression for B1: deselecting the tags column must not leak stale tagMapping,
  // otherwise the backend creates tags the user opted out of.
  it('omits tagMapping from the request when the tags column is deselected, even if stale tagMapping lingers', async () => {
    mockDetectDuplicatesApi.mockResolvedValue(BASE_RESPONSE);
    mockExecuteImportApi.mockResolvedValue(EXECUTE_RESPONSE);

    const store = useImportExportStore();
    seedStore(store);
    // Tags column is NOT set, but a stale mapping is present from a prior selection.
    store.columnMapping.tags = null;
    store.tagMapping = { OrphanTag: { action: 'create-new' } };
    await store.detectDuplicates();

    await store.executeImport();

    expect(mockExecuteImportApi).toHaveBeenCalledWith(expect.objectContaining({ tagMapping: undefined }));
  });
});

describe('useImportExportStore – execute error handling', () => {
  // The two real failure modes of the async import:
  //   1. enqueue failure — the execute POST itself rejects, surfaced via the
  //      watchdog's setExecuteError; the wizard must NOT advance off `review`.
  //   2. job failure — the enqueued job later reports `failed`, surfaced via the
  //      watchdog's `progress`/`executeError` (driven here through the captured
  //      onFailure callback). The old `importError`/`importResult` refs are gone.
  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  it('records the error and stays on review when enqueuing the job fails', async () => {
    mockDetectDuplicatesApi.mockResolvedValue(BASE_RESPONSE);
    mockExecuteImportApi.mockRejectedValue(new Error('Import failed'));

    const store = useImportExportStore();
    seedStore(store);
    await store.detectDuplicates();
    expect(store.currentStepKey).toBe('review');

    // The store no longer re-throws on an enqueue failure; it sets the terminal
    // error via the watchdog and leaves the user on `review` to retry.
    await store.executeImport();

    expect(mockJobProgressSetExecuteError).toHaveBeenCalledWith(expect.any(String));
    expect(store.executeError).not.toBeNull();
    // Wizard must not advance to results, and the watchdog must not be armed.
    expect(store.currentStepKey).toBe('review');
    expect(mockJobProgressStart).not.toHaveBeenCalled();
  });

  it('does not arm the watchdog or advance when the column mapping cannot be built', async () => {
    const store = useImportExportStore();
    // No seedStore: an empty mapping makes toColumnMappingConfig return null, so
    // executeImport bails early with a terminal error before ever calling the API.
    await store.executeImport();

    expect(mockExecuteImportApi).not.toHaveBeenCalled();
    expect(mockJobProgressSetExecuteError).toHaveBeenCalledWith(expect.any(String));
    expect(mockJobProgressStart).not.toHaveBeenCalled();
  });

  it('surfaces a failed job via progress/executeError once the job reports failure', async () => {
    mockDetectDuplicatesApi.mockResolvedValue(BASE_RESPONSE);
    mockExecuteImportApi.mockResolvedValue(EXECUTE_RESPONSE);

    const store = useImportExportStore();
    seedStore(store);
    await store.detectDuplicates();
    await store.executeImport();

    // The job was accepted, so the wizard is on results with the watchdog armed.
    expect(store.currentStepKey).toBe('results');

    // Simulate the watchdog observing a terminal `failed` payload: it updates its
    // `progress` ref and runs onFailure. The store exposes that failure through
    // `progress` (status === 'failed') rather than the removed importError ref.
    const failedPayload = {
      jobId: 'job-1',
      status: 'failed' as const,
      processedCount: 0,
      totalCount: 0,
      error: 'Worker blew up',
    };
    mockJobProgress.value = failedPayload;
    await capturedJobProgressConfig!.onFailure(failedPayload as never);

    expect(store.progress).toEqual(expect.objectContaining({ status: 'failed', error: 'Worker blew up' }));
  });

  it('reset clears the watchdog error and stops the watchdog', () => {
    const store = useImportExportStore();

    store.reset();

    // reset() tears the watchdog down and clears its terminal error.
    expect(mockJobProgressStop).toHaveBeenCalled();
    expect(mockJobProgressSetExecuteError).toHaveBeenCalledWith(null);
    expect(store.executeError).toBeNull();
  });
});

describe('useImportExportStore – isMapStepValid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  it('is true when every required field has both a method and its decision', () => {
    const store = useImportExportStore();
    seedStore(store);

    expect(store.isMapStepValid).toBe(true);
  });

  // Regression: picking a category method without selecting a CSV column must NOT let Next through.
  it('is false when category uses a CSV-column method but no column is selected', () => {
    const store = useImportExportStore();
    seedStore(store);

    store.columnMapping.category = { option: CategoryOptionValue.createNewCategories, columnName: '' };
    expect(store.isMapStepValid).toBe(false);

    store.columnMapping.category = { option: CategoryOptionValue.mapDataSourceColumn, columnName: '' };
    expect(store.isMapStepValid).toBe(false);

    // Choosing the column resolves it.
    store.columnMapping.category = { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'category' };
    expect(store.isMapStepValid).toBe(true);
  });

  it('is false when account or currency from-column methods have no column selected', () => {
    const store = useImportExportStore();
    seedStore(store);

    store.columnMapping.account = { option: AccountOptionValue.dataSourceColumn, columnName: '' };
    expect(store.isMapStepValid).toBe(false);

    store.columnMapping.account = { option: AccountOptionValue.dataSourceColumn, columnName: 'account' };
    store.columnMapping.currency = { option: CurrencyOptionValue.dataSourceColumn, columnName: '' };
    expect(store.isMapStepValid).toBe(false);
  });

  it('is false when transaction-type from-column lacks a column or either value list', () => {
    const store = useImportExportStore();
    seedStore(store);

    store.columnMapping.transactionType = {
      option: TransactionTypeOptionValue.dataSourceColumn,
      columnName: 'type',
      incomeValues: [],
      expenseValues: [],
    };
    expect(store.isMapStepValid).toBe(false);

    store.columnMapping.transactionType = {
      option: TransactionTypeOptionValue.dataSourceColumn,
      columnName: 'type',
      incomeValues: ['Ingreso'],
      expenseValues: ['Gasto'],
    };
    expect(store.isMapStepValid).toBe(true);
  });
});

describe('useImportExportStore – isResolveStepValid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  it('accounts (from-column): true when all resolved, false when a link row has an empty id', () => {
    const store = useImportExportStore();
    store.columnMapping.account = { option: AccountOptionValue.dataSourceColumn, columnName: 'account' };
    store.uniqueAccountsInCSV = [
      { name: 'Checking', currency: 'USD' },
      { name: 'Savings', currency: 'USD' },
    ] as SourceAccount[];

    store.accountMapping = {
      Checking: { action: 'link-existing', accountId: 'acc-1' },
      Savings: { action: 'create-new' },
    };
    expect(store.isResolveStepValid).toBe(true);

    // A link-existing row with an empty target id is not fully resolved.
    store.accountMapping = {
      Checking: { action: 'link-existing', accountId: '' },
      Savings: { action: 'create-new' },
    };
    expect(store.isResolveStepValid).toBe(false);
  });

  it('categories (map-from-column): true when all resolved, false when a link row has an empty id', () => {
    const store = useImportExportStore();
    store.columnMapping.category = { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'category' };
    store.uniqueCategoriesInCSV = ['Food', 'Travel'];

    store.categoryMapping = {
      Food: { action: 'link-existing', categoryId: 'cat-1' },
      Travel: { action: 'create-new' },
    };
    expect(store.isResolveStepValid).toBe(true);

    store.categoryMapping = {
      Food: { action: 'link-existing', categoryId: '' },
      Travel: { action: 'create-new' },
    };
    expect(store.isResolveStepValid).toBe(false);
  });

  it('tags (map-from-column): skip counts as resolved; a link row with an empty id does not', () => {
    const store = useImportExportStore();
    store.columnMapping.tags = { option: TagOptionValue.mapDataSourceColumn, columnName: 'labels' };
    store.uniqueTagsInCSV = ['urgent', 'work'];

    // skip is a complete decision, on par with create-new / a linked id.
    store.tagMapping = {
      urgent: { action: 'skip' },
      work: { action: 'link-existing', tagId: 'tag-1' },
    };
    expect(store.isResolveStepValid).toBe(true);

    store.tagMapping = {
      urgent: { action: 'skip' },
      work: { action: 'link-existing', tagId: '' },
    };
    expect(store.isResolveStepValid).toBe(false);
  });
});

describe('useImportExportStore – needsResolveStep & visibleSteps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  const stepKeys = (store: ReturnType<typeof useImportExportStore>) => store.visibleSteps.map((s) => s.key);

  it('category map-from-column requires the resolve step', () => {
    const store = useImportExportStore();
    store.columnMapping.category = { option: CategoryOptionValue.mapDataSourceColumn, columnName: 'category' };

    expect(store.needsResolveStep).toBe(true);
    expect(stepKeys(store)).toContain('resolve');
  });

  it('category create-new requires the resolve step', () => {
    const store = useImportExportStore();
    store.columnMapping.category = { option: CategoryOptionValue.createNewCategories, columnName: 'category' };

    expect(store.needsResolveStep).toBe(true);
    expect(stepKeys(store)).toContain('resolve');
  });

  it('account from-column requires the resolve step', () => {
    const store = useImportExportStore();
    store.columnMapping.account = { option: AccountOptionValue.dataSourceColumn, columnName: 'account' };

    expect(store.needsResolveStep).toBe(true);
    expect(stepKeys(store)).toContain('resolve');
  });

  it('tags map-from-column requires the resolve step', () => {
    const store = useImportExportStore();
    store.columnMapping.tags = { option: TagOptionValue.mapDataSourceColumn, columnName: 'labels' };

    expect(store.needsResolveStep).toBe(true);
    expect(stepKeys(store)).toContain('resolve');
  });

  it('currency from-column does NOT add the resolve step', () => {
    const store = useImportExportStore();
    store.columnMapping.currency = { option: CurrencyOptionValue.dataSourceColumn, columnName: 'currency' };

    expect(store.needsResolveStep).toBe(false);
    expect(stepKeys(store)).not.toContain('resolve');
    expect(stepKeys(store)).toEqual(['upload', 'map', 'review', 'results']);
  });

  it('transaction-type from-column does NOT add the resolve step', () => {
    const store = useImportExportStore();
    store.columnMapping.transactionType = {
      option: TransactionTypeOptionValue.dataSourceColumn,
      columnName: 'type',
      incomeValues: ['Ingreso'],
      expenseValues: ['Gasto'],
    };

    expect(store.needsResolveStep).toBe(false);
    expect(stepKeys(store)).not.toContain('resolve');
  });
});

describe('useImportExportStore – parseFiles', () => {
  const mockParseCsvApi = vi.mocked(apiModule.parseCsv);

  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  /** Minimal File stand-in: parseFiles reads `.name` and calls `.text()` (via the merge util). */
  const fakeFile = (content: string, name = 'test.csv') =>
    ({ name, text: () => Promise.resolve(content) }) as unknown as File;

  it('strips empty-string headers and seeds columnMapping/columnMatch from the parse response', async () => {
    mockParseCsvApi.mockResolvedValue({
      // A trailing empty header (common with a dangling delimiter) must be dropped.
      headers: ['date', 'amount', ''],
      preview: [{ date: '2026-01-01', amount: '100', '': '' }],
      detectedDelimiter: ',',
      totalRows: 1,
    });

    const store = useImportExportStore();

    await store.parseFiles({ files: [fakeFile('date,amount,\n2026-01-01,100,')] });

    expect(store.csvHeaders).toEqual(['date', 'amount']);
    expect(store.csvHeaders).not.toContain('');

    // Matcher ran over the cleaned headers and seeded both the raw match result
    // and the working mapping (date/amount are recognised simple columns).
    expect(store.columnMatch).not.toBeNull();
    expect(store.columnMapping.date).toBe('date');
    expect(store.columnMapping.amount).toBe('amount');

    // Upload is marked done and the wizard advances to the Map step.
    expect(store.currentStepKey).toBe('map');
  });

  it('merges several files into one combined payload before parsing', async () => {
    mockParseCsvApi.mockResolvedValue({
      headers: ['date', 'amount'],
      preview: [{ date: '2026-01-01', amount: '100' }],
      detectedDelimiter: ',',
      totalRows: 2,
    });

    const store = useImportExportStore();

    await store.parseFiles({
      files: [fakeFile('date,amount\n2026-01-01,100', 'jan.csv'), fakeFile('date,amount\n2026-02-01,200', 'feb.csv')],
    });

    // Both files are retained, and the backend received a single combined CSV
    // carrying every file's rows.
    expect(store.uploadedFiles).toHaveLength(2);
    expect(mockParseCsvApi).toHaveBeenCalledTimes(1);
    const sentContent = mockParseCsvApi.mock.calls[0]![0].fileContent;
    expect(sentContent).toContain('2026-01-01');
    expect(sentContent).toContain('2026-02-01');
    expect(store.currentStepKey).toBe('map');
  });

  it('propagates a MergeCsvError when headers differ across files', async () => {
    const store = useImportExportStore();

    await expect(
      store.parseFiles({
        files: [fakeFile('date,amount\n2026-01-01,100', 'a.csv'), fakeFile('date,total\n2026-02-01,200', 'b.csv')],
      }),
    ).rejects.toMatchObject({ code: 'HEADER_MISMATCH', fileName: 'b.csv' });

    // The backend parse is never reached, and the wizard stays on upload.
    expect(mockParseCsvApi).not.toHaveBeenCalled();
    expect(store.currentStepKey).toBe('upload');
  });

  it('classifies transaction-type values over the full data, covering values past the preview', async () => {
    // Preview shows only the first (Spanish) row, mirroring the real bug: the
    // English values appear later. Re-classification over the full data must cover them.
    mockParseCsvApi.mockResolvedValue({
      headers: ['date', 'amount', 'type'],
      preview: [{ date: '2026-01-01', amount: '100', type: 'Gasto' }],
      detectedDelimiter: ',',
      totalRows: 4,
    });

    const store = useImportExportStore();

    await store.parseFiles({
      files: [
        fakeFile(
          'date,amount,type\n2026-01-01,100,Gasto\n2026-01-02,200,Ingreso\n2026-01-03,300,Expense\n2026-01-04,400,Income',
          'mixed.csv',
        ),
      ],
    });

    expect(store.uncoveredTransactionTypeValues).toEqual([]);

    const transactionType = store.columnMapping.transactionType;
    expect(transactionType.option).toBe(TransactionTypeOptionValue.dataSourceColumn);
    if (transactionType.option === TransactionTypeOptionValue.dataSourceColumn) {
      // Assert each list separately so an income/expense swap is caught — a merged-and-sorted
      // union would still pass even if the classifier mislabelled every value.
      expect([...transactionType.incomeValues].sort()).toEqual(['Income', 'Ingreso']);
      expect([...transactionType.expenseValues].sort()).toEqual(['Expense', 'Gasto']);
    }
  });

  it('flags transaction-type values it cannot classify and blocks the Map step', async () => {
    mockParseCsvApi.mockResolvedValue({
      headers: ['date', 'amount', 'type'],
      preview: [{ date: '2026-01-01', amount: '100', type: 'ZZZ' }],
      detectedDelimiter: ',',
      totalRows: 2,
    });

    const store = useImportExportStore();

    await store.parseFiles({
      files: [fakeFile('date,amount,type\n2026-01-01,100,ZZZ\n2026-01-02,200,QQQ', 'unknown.csv')],
    });

    expect(store.uncoveredTransactionTypeValues).toEqual(['ZZZ', 'QQQ']);
    expect(store.isMapStepValid).toBe(false);
  });
});
