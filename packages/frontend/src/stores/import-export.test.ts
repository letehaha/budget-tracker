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

// useQueryClient is called at store construction time; provide a real QueryClient
// instance so Pinia initialisation doesn't throw.
vi.mock('@tanstack/vue-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/vue-query')>();
  return {
    ...actual,
    useQueryClient: vi.fn(() => new QueryClient()),
  };
});

vi.mock('./onboarding', () => ({
  useOnboardingStore: vi.fn(() => ({ completeTask: vi.fn() })),
}));

// ----- helpers -----

import * as apiModule from '@/api/import-export';
import type { DetectDuplicatesResponse } from '@bt/shared/types';

const mockDetectDuplicatesApi = vi.mocked(apiModule.detectDuplicates);

/** Mount a minimal component so Pinia + VueQuery plugins are active. */
const mountWithPlugins = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const pinia = createPinia();
  setActivePinia(pinia);

  const Wrapper = defineComponent({ setup() {}, template: '<div />' });
  mount(Wrapper, {
    global: { plugins: [pinia, [VueQueryPlugin, { queryClient }]] },
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
