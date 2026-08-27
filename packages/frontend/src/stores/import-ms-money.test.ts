import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Ref, defineComponent, ref } from 'vue';

import { useImportMsMoneyStore } from './import-ms-money';

// ----- module mocks -----

// The store's async actions call these; mocked so upload/detect/execute run
// without touching the network.
vi.mock('@/api/import-ms-money', () => ({
  uploadMsMoneyFile: vi.fn(),
  detectMsMoneyDuplicates: vi.fn(),
  executeMsMoneyImport: vi.fn(),
  getMsMoneyImportStatus: vi.fn(),
}));

vi.mock('@/api/resource-leases', () => ({ refreshResourceLease: vi.fn() }));

// The store arms a `useImportJobProgress` watchdog at construction time. Mock it
// so nothing real subscribes to SSE or starts a poll timer, and so tests can
// drive `progress` and assert on the error setter.
let mockJobProgress: Ref<unknown>;
let mockJobExecuteError: Ref<string | null>;
let mockSetExecuteError: ReturnType<typeof vi.fn>;

vi.mock('@/composable/use-import-job-progress', () => ({
  useImportJobProgress: vi.fn(() => ({
    progress: mockJobProgress,
    executeError: mockJobExecuteError,
    setExecuteError: mockSetExecuteError,
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

// useQueryClient is called at store construction time; hand back a shared client.
let sharedQueryClient: QueryClient;
vi.mock('@tanstack/vue-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/vue-query')>();
  return { ...actual, useQueryClient: vi.fn(() => sharedQueryClient) };
});

// Existing app accounts + categories are the auto-match link targets. `categories`
// is non-empty and accounts report as already fetched, so `prepareResolveStep`
// runs the auto-match immediately without firing a load.
vi.mock('@/stores/accounts', () => {
  const mockAccounts = [{ id: 1, name: 'Cash', currencyCode: 'USD' }];
  return {
    useAccountsStore: vi.fn(() => ({
      accounts: mockAccounts,
      importLinkableAccounts: mockAccounts,
      isAccountsFetched: true,
      refetchAccounts: vi.fn(),
    })),
  };
});

vi.mock('@/stores/categories/categories', () => ({
  useCategoriesStore: vi.fn(() => ({
    categories: [{ id: 'cat-groceries', name: 'Groceries', subCategories: [] }],
    formattedCategories: [{ id: 'cat-groceries', name: 'Groceries', subCategories: [] }],
    categoriesMap: { 'cat-groceries': { id: 'cat-groceries', name: 'Groceries' } },
    loadCategories: vi.fn(),
  })),
}));

// Only referenced inside the (never-fired) onComplete callback; stubbed so the
// real modules aren't pulled in.
vi.mock('@/stores/currencies', () => ({ useCurrenciesStore: vi.fn(() => ({ loadCurrencies: vi.fn() })) }));
vi.mock('@/stores/tags', () => ({ useTagsStore: vi.fn(() => ({ loadTags: vi.fn() })) }));

// Error copy is looked up by key; the mock returns the key verbatim so tests can
// assert which message was shown.
vi.mock('@/i18n', () => ({ i18n: { global: { t: (key: string) => key } } }));

// The store reads the persisted recalculate-balance default from user settings at
// construction and PATCHes the chosen value back after a successful execute.
let mockUserSettingsData: Ref<
  { import?: { recalculateAccountBalance?: boolean; categoryMappingPresets?: CategoryMappingPreset[] } } | undefined
>;
let mockPatchUserSettingsAsync: ReturnType<typeof vi.fn>;

vi.mock('@/composable/data-queries/user-settings', () => ({
  useUserSettings: vi.fn(() => ({
    data: mockUserSettingsData,
    patchAsync: mockPatchUserSettingsAsync,
  })),
}));

// ----- helpers -----

import * as msMoneyApi from '@/api/import-ms-money';
import {
  MsMoneyAccountType,
  type CategoryMappingPreset,
  type MsMoneyParseResult,
  type MsMoneyUploadResponse,
  type ResourceLease,
} from '@bt/shared/types';

const mockUpload = vi.mocked(msMoneyApi.uploadMsMoneyFile);
const mockDetect = vi.mocked(msMoneyApi.detectMsMoneyDuplicates);
const mockExecute = vi.mocked(msMoneyApi.executeMsMoneyImport);

/**
 * One account and one category that exactly match existing app entities (they
 * auto-link), plus one of each that matches nothing (they fall back to create-new).
 */
const PARSE_RESULT: MsMoneyParseResult = {
  accounts: [
    {
      originalName: 'Cash',
      currency: 'USD',
      accountType: MsMoneyAccountType.banking,
      transactionCount: 2,
      netImportedAmount: -10,
    },
    {
      originalName: 'Unmatched Bank',
      currency: 'USD',
      accountType: MsMoneyAccountType.banking,
      transactionCount: 1,
      netImportedAmount: 5,
    },
  ],
  categories: [
    { fullName: 'Groceries', name: 'Groceries', groupName: null, transactionCount: 2 },
    { fullName: 'Auto:Gas', name: 'Gas', groupName: 'Auto', transactionCount: 1 },
  ],
  payees: [],
  transactions: [],
  transfers: [],
  warnings: [],
  dateRange: null,
  baseCurrency: 'USD',
  encryption: 'new-sha1',
};

const LEASE: ResourceLease = {
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  maxExpiresAt: new Date(Date.now() + 600_000).toISOString(),
  expiresInMs: 60_000,
  maxExpiresInMs: 600_000,
};

const UPLOAD_RESPONSE: MsMoneyUploadResponse = { uploadId: 'upload-1', result: PARSE_RESULT, lease: LEASE };

const mountWithPlugins = () => {
  sharedQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockJobProgress = ref(null);
  mockJobExecuteError = ref<string | null>(null);
  mockSetExecuteError = vi.fn();
  mockUserSettingsData = ref(undefined);
  mockPatchUserSettingsAsync = vi.fn(() => Promise.resolve({}));

  const pinia = createPinia();
  setActivePinia(pinia);
  const Wrapper = defineComponent({ setup() {}, template: '<div />' });
  mount(Wrapper, { global: { plugins: [pinia, [VueQueryPlugin, { queryClient: sharedQueryClient }]] } });
};

const aFile = () => new File(['mny'], 'money.mny', { type: 'application/octet-stream' });

/** Uploads the fixture and returns the store sitting on the resolve step. */
const uploadedStore = async () => {
  mockUpload.mockResolvedValue(UPLOAD_RESPONSE);
  const store = useImportMsMoneyStore();
  await store.uploadFile({ file: aFile() });
  return store;
};

// ----- tests -----

describe('useImportMsMoneyStore – wire mapping guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  it('refuses to send an account that is set to link but has no target', async () => {
    const store = await uploadedStore();
    store.setAccountAction({ name: 'Cash', action: 'link-existing' });

    await expect(store.detectDuplicates()).rejects.toThrow(/no target was selected/);
    expect(mockDetect).not.toHaveBeenCalled();
    expect(store.detectError).toMatch(/no target was selected/);
  });

  it('refuses to send a category that is set to link but has no target', async () => {
    const store = await uploadedStore();
    store.setCategoryAction({ name: 'Auto:Gas', action: 'link-existing' });

    await store.execute();

    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockSetExecuteError).toHaveBeenCalledWith(expect.stringMatching(/no target was selected/));
  });

  it('sends resolved mappings through untouched', async () => {
    const store = await uploadedStore();
    mockExecute.mockResolvedValue({ jobId: 'job-1' });

    await store.execute();

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadId: 'upload-1',
        accountMapping: expect.objectContaining({ Cash: { action: 'link-existing', accountId: '1' } }),
        categoryMapping: expect.objectContaining({
          Groceries: { action: 'link-existing', categoryId: 'cat-groceries' },
        }),
      }),
    );
  });
});

describe('useImportMsMoneyStore – detectDuplicates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  it('skips the endpoint when no account maps onto an existing one', async () => {
    const store = await uploadedStore();
    store.setAccountAction({ name: 'Cash', action: 'create-new' });

    await store.detectDuplicates();

    expect(mockDetect).not.toHaveBeenCalled();
    expect(store.duplicates).toEqual([]);
    expect(store.currentStepKey).toBe('review');
  });

  it('bounces back to the upload step when the cached parse result is gone', async () => {
    const store = useImportMsMoneyStore();

    await store.detectDuplicates();

    expect(mockDetect).not.toHaveBeenCalled();
    expect(store.currentStepKey).toBe('upload');
    expect(store.detectError).toBe('pages.importExport.msMoneyImport.errors.uploadUnavailable');
  });
});

describe('useImportMsMoneyStore – execute guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  it('enqueues once when the import button is hit twice before the first call settles', async () => {
    const store = await uploadedStore();
    mockExecute.mockResolvedValue({ jobId: 'job-1' });

    await Promise.all([store.execute(), store.execute()]);

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('ignores execute while a job is already running', async () => {
    const store = await uploadedStore();
    mockJobProgress.value = { jobId: 'job-1', status: 'running', processedCount: 1, totalCount: 10 };

    await store.execute();

    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe('useImportMsMoneyStore – hasActiveJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  it('is false for a wizard that has not enqueued anything', async () => {
    const store = await uploadedStore();

    expect(store.hasActiveJob).toBe(false);
  });

  it.each(['queued', 'running', 'completed', 'failed'])('stays true while a %s job is on screen', (status) => {
    const store = useImportMsMoneyStore();
    mockJobProgress.value = { jobId: 'job-1', status, processedCount: 0, totalCount: 0 };

    expect(store.hasActiveJob).toBe(true);
  });

  it('drops back to false once the results are reset away', () => {
    const store = useImportMsMoneyStore();
    mockJobProgress.value = { jobId: 'job-1', status: 'completed', processedCount: 1, totalCount: 1 };

    store.reset();

    expect(store.hasActiveJob).toBe(false);
  });
});

describe('useImportMsMoneyStore – bounce messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  it('clears the errors left by an earlier attempt when a new file is uploaded', async () => {
    const store = useImportMsMoneyStore();
    await store.detectDuplicates();
    expect(store.detectError).not.toBeNull();

    mockUpload.mockResolvedValue(UPLOAD_RESPONSE);
    await store.uploadFile({ file: aFile() });

    expect(store.detectError).toBeNull();
    expect(mockSetExecuteError).toHaveBeenCalledWith(null);
  });

  it('reports the upload failure with the server message', async () => {
    const store = useImportMsMoneyStore();
    mockUpload.mockRejectedValue(new Error('Wrong password'));

    await expect(store.uploadFile({ file: aFile() })).rejects.toThrow('Wrong password');
    expect(store.uploadError).toBe('Wrong password');
  });

  it('falls back to the shared error copy when the failure carries no message', async () => {
    const store = useImportMsMoneyStore();
    mockUpload.mockRejectedValue('boom');

    await expect(store.uploadFile({ file: aFile() })).rejects.toBe('boom');
    expect(store.uploadError).toBe('errors.api.unexpectedError');
  });
});

describe('useImportMsMoneyStore – remembered category mappings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  it('applies the ms-money preset and re-persists it under the flow fingerprint on execute', async () => {
    mockUserSettingsData.value = {
      import: {
        categoryMappingPresets: [
          {
            fingerprint: 'ms-money',
            categoryMapping: { 'Auto:Gas': { action: 'link-existing', categoryId: 'cat-groceries' } },
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    };
    mockExecute.mockResolvedValue({ jobId: 'job-preset' });

    const store = await uploadedStore();

    expect(store.matchingCategoryPreset?.fingerprint).toBe('ms-money');

    store.applyCategoryPreset({ preset: store.matchingCategoryPreset! });
    expect(store.categoryMapping['Auto:Gas']).toEqual({ action: 'link-existing', categoryId: 'cat-groceries' });

    await store.execute();

    const presets = mockPatchUserSettingsAsync.mock.calls.at(-1)![0].import.categoryMappingPresets;
    expect(presets).toHaveLength(1);
    expect(presets[0]).toEqual(
      expect.objectContaining({
        fingerprint: 'ms-money',
        categoryMapping: {
          Groceries: { action: 'link-existing', categoryId: 'cat-groceries' },
          'Auto:Gas': { action: 'link-existing', categoryId: 'cat-groceries' },
        },
      }),
    );
  });
});
