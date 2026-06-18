import { VUE_QUERY_CACHE_KEYS, VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const/vue-query';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';

import { useImportExportStore } from './import-export';

// ----- module mocks -----

// The store does `await import('@/api/import-export')` inside its action, so we
// mock the module statically here and Vitest intercepts the dynamic import too.
vi.mock('@/api/import-export', () => ({
  detectDuplicates: vi.fn(),
  parseCsv: vi.fn(),
  extractUniqueValues: vi.fn(),
  executeImport: vi.fn(),
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

// ----- helpers -----

import * as apiModule from '@/api/import-export';
import type { DetectDuplicatesResponse } from '@bt/shared/types';

import { useCategoriesStore } from './categories/categories';

const mockDetectDuplicatesApi = vi.mocked(apiModule.detectDuplicates);
const mockExecuteImportApi = vi.mocked(apiModule.executeImport);

/** Mount a minimal component so Pinia + VueQuery plugins are active. */
const mountWithPlugins = () => {
  // Create a fresh shared client before each test so spies start clean.
  sharedQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

describe('useImportExportStore – executeImport skipUnpriceableIndices', () => {
  const EXECUTE_RESPONSE = {
    summary: {
      imported: 5,
      skipped: 1,
      skippedUnpriceable: 2,
      accountsCreated: 0,
      categoriesCreated: 0,
      tagsCreated: 0,
      errors: [],
    },
    newTransactionIds: [],
    batchId: 'batch-abc',
  };

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
});

describe('useImportExportStore – executeImport cache invalidation', () => {
  const EXECUTE_RESPONSE = {
    summary: {
      imported: 3,
      skipped: 0,
      skippedUnpriceable: 0,
      accountsCreated: 1,
      categoriesCreated: 1,
      tagsCreated: 0,
      errors: [],
    },
    newTransactionIds: ['tx-1', 'tx-2', 'tx-3'],
    batchId: 'batch-xyz',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  it('invalidates transactionChange-prefixed queries after a successful import', async () => {
    mockDetectDuplicatesApi.mockResolvedValue(BASE_RESPONSE);
    mockExecuteImportApi.mockResolvedValue(EXECUTE_RESPONSE);

    const invalidateSpy = vi.spyOn(sharedQueryClient, 'invalidateQueries');

    const store = useImportExportStore();
    seedStore(store);
    await store.detectDuplicates();
    await store.executeImport();

    // All transaction-change queries (widgets, analytics, records, accounts, balances, etc.)
    // must be invalidated so views reflect newly imported transactions.
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] }),
    );
  });

  it('invalidates currencies-prefixed queries after a successful import', async () => {
    mockDetectDuplicatesApi.mockResolvedValue(BASE_RESPONSE);
    mockExecuteImportApi.mockResolvedValue(EXECUTE_RESPONSE);

    const invalidateSpy = vi.spyOn(sharedQueryClient, 'invalidateQueries');

    const store = useImportExportStore();
    seedStore(store);
    await store.detectDuplicates();
    await store.executeImport();

    // Import can connect new user currencies; invalidate the whole currencies prefix
    // so userCurrencies, allCurrencies, baseCurrency and rate queries all refresh.
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.currencies] }),
    );
  });

  it('invalidates categoriesByAccount queries after a successful import', async () => {
    mockDetectDuplicatesApi.mockResolvedValue(BASE_RESPONSE);
    mockExecuteImportApi.mockResolvedValue(EXECUTE_RESPONSE);

    const invalidateSpy = vi.spyOn(sharedQueryClient, 'invalidateQueries');

    const store = useImportExportStore();
    seedStore(store);
    await store.detectDuplicates();
    await store.executeImport();

    // Import can create new categories; categoriesByAccount has no prefix so it
    // must be explicitly invalidated (not covered by transactionChange).
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: VUE_QUERY_CACHE_KEYS.categoriesByAccount }),
    );
  });

  it('does not call invalidateQueries when the import API call fails', async () => {
    mockDetectDuplicatesApi.mockResolvedValue(BASE_RESPONSE);
    mockExecuteImportApi.mockRejectedValue(new Error('Import failed'));

    const invalidateSpy = vi.spyOn(sharedQueryClient, 'invalidateQueries');

    const store = useImportExportStore();
    seedStore(store);
    await store.detectDuplicates();

    await expect(store.executeImport()).rejects.toThrow('Import failed');

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useImportExportStore – executeImport categories store refresh', () => {
  const makeExecuteResponse = (categoriesCreated: number) => ({
    summary: {
      imported: 2,
      skipped: 0,
      skippedUnpriceable: 0,
      accountsCreated: 0,
      categoriesCreated,
      tagsCreated: 0,
      errors: [],
    },
    newTransactionIds: ['tx-1'],
    batchId: 'batch-cat',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  it('calls loadCategories after a successful import that created new categories', async () => {
    mockDetectDuplicatesApi.mockResolvedValue(BASE_RESPONSE);
    mockExecuteImportApi.mockResolvedValue(makeExecuteResponse(2));

    const mockLoadCategories = vi.fn();
    vi.mocked(useCategoriesStore).mockReturnValue({ loadCategories: mockLoadCategories } as never);

    const store = useImportExportStore();
    seedStore(store);
    await store.detectDuplicates();
    await store.executeImport();

    // The Pinia categories store is not VueQuery-backed, so invalidateQueries
    // alone won't refresh it — loadCategories must be called explicitly so
    // newly-created categories appear in pickers without a full page reload.
    expect(mockLoadCategories).toHaveBeenCalledOnce();
  });

  it('does not call loadCategories when no categories were created', async () => {
    mockDetectDuplicatesApi.mockResolvedValue(BASE_RESPONSE);
    mockExecuteImportApi.mockResolvedValue(makeExecuteResponse(0));

    const mockLoadCategories = vi.fn();
    vi.mocked(useCategoriesStore).mockReturnValue({ loadCategories: mockLoadCategories } as never);

    const store = useImportExportStore();
    seedStore(store);
    await store.detectDuplicates();
    await store.executeImport();

    expect(mockLoadCategories).not.toHaveBeenCalled();
  });

  it('does not call loadCategories when the import API call fails', async () => {
    mockDetectDuplicatesApi.mockResolvedValue(BASE_RESPONSE);
    mockExecuteImportApi.mockRejectedValue(new Error('Import failed'));

    const mockLoadCategories = vi.fn();
    vi.mocked(useCategoriesStore).mockReturnValue({ loadCategories: mockLoadCategories } as never);

    const store = useImportExportStore();
    seedStore(store);
    await store.detectDuplicates();

    await expect(store.executeImport()).rejects.toThrow('Import failed');

    expect(mockLoadCategories).not.toHaveBeenCalled();
  });
});

describe('useImportExportStore – executeImport tagMapping inclusion', () => {
  const EXECUTE_RESPONSE = {
    summary: {
      imported: 1,
      skipped: 0,
      skippedUnpriceable: 0,
      accountsCreated: 0,
      categoriesCreated: 0,
      tagsCreated: 0,
      errors: [],
    },
    newTransactionIds: ['tx-1'],
    batchId: 'batch-tags',
  };

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

describe('useImportExportStore – importError', () => {
  const EXECUTE_RESPONSE = {
    summary: {
      imported: 1,
      skipped: 0,
      skippedUnpriceable: 0,
      accountsCreated: 0,
      categoriesCreated: 0,
      tagsCreated: 0,
      errors: [],
    },
    newTransactionIds: ['tx-1'],
    batchId: 'batch-err',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  it('sets importError when the import API call rejects', async () => {
    mockDetectDuplicatesApi.mockResolvedValue(BASE_RESPONSE);
    mockExecuteImportApi.mockRejectedValue(new Error('Import failed'));

    const store = useImportExportStore();
    seedStore(store);
    await store.detectDuplicates();

    await expect(store.executeImport()).rejects.toThrow('Import failed');

    expect(store.importError).not.toBeNull();
  });

  it('clears importError on a fresh import that succeeds after a prior failure', async () => {
    mockDetectDuplicatesApi.mockResolvedValue(BASE_RESPONSE);
    mockExecuteImportApi.mockRejectedValueOnce(new Error('Import failed'));
    mockExecuteImportApi.mockResolvedValueOnce(EXECUTE_RESPONSE);

    const store = useImportExportStore();
    seedStore(store);
    await store.detectDuplicates();

    // First attempt fails and records the error.
    await expect(store.executeImport()).rejects.toThrow('Import failed');
    expect(store.importError).not.toBeNull();

    // Second attempt succeeds and must clear the stale error.
    await store.executeImport();
    expect(store.importError).toBeNull();
  });

  it('reset clears importError', () => {
    const store = useImportExportStore();
    store.importError = 'Something went wrong';

    store.reset();

    expect(store.importError).toBeNull();
  });
});
