import { QueryClient } from '@tanstack/vue-query';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Ref, computed, ref } from 'vue';

import { useImportOfxStore } from './import-ofx';

vi.mock('@/api/import-ofx', () => ({
  uploadOfxFile: vi.fn(),
  detectOfxDuplicates: vi.fn(),
  executeOfxImport: vi.fn(),
  getOfxImportStatus: vi.fn(),
}));
vi.mock('@/api/resource-leases', () => ({ refreshResourceLease: vi.fn() }));

let mockProgress: Ref<unknown>;
let mockExecuteError: Ref<string | null>;
let mockStart: ReturnType<typeof vi.fn>;
let mockSetExecuteError: ReturnType<typeof vi.fn>;
vi.mock('@/composable/use-import-job-progress', () => ({
  useImportJobProgress: vi.fn(() => ({
    progress: mockProgress,
    executeError: mockExecuteError,
    start: mockStart,
    stop: vi.fn(),
    setExecuteError: mockSetExecuteError,
  })),
}));

const mockRecalculateBalance = ref(false);
vi.mock('@/composable/use-recalculate-balance-toggle', () => ({
  useRecalculateBalanceToggle: vi.fn(() => ({
    recalculateBalance: computed({
      get: () => mockRecalculateBalance.value,
      set: (value) => (mockRecalculateBalance.value = value),
    }),
    settingsLoading: ref(false),
    settingsLoadFailed: ref(false),
    persistRecalculateBalanceSetting: vi.fn(),
    resetOverride: vi.fn(),
  })),
}));

const existingAccounts = [{ id: 42, name: 'Checking', currencyCode: 'USD' }];
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: vi.fn(() => ({
    importLinkableAccounts: existingAccounts,
    isAccountsFetched: true,
    refetchAccounts: vi.fn(),
  })),
}));
vi.mock('@/stores/currencies', () => ({ useCurrenciesStore: vi.fn(() => ({ loadCurrencies: vi.fn() })) }));
vi.mock('@/i18n', () => ({ i18n: { global: { t: (key: string) => key } } }));

let queryClient: QueryClient;
vi.mock('@tanstack/vue-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/vue-query')>();
  return { ...actual, useQueryClient: vi.fn(() => queryClient) };
});

import * as ofxApi from '@/api/import-ofx';
import { type OfxParseResult, type OfxUploadResponse, type ResourceLease } from '@bt/shared/types';

const mockUpload = vi.mocked(ofxApi.uploadOfxFile);
const mockDetect = vi.mocked(ofxApi.detectOfxDuplicates);
const mockExecute = vi.mocked(ofxApi.executeOfxImport);

const PARSE_RESULT: OfxParseResult = {
  accounts: [
    {
      sourceAccountKey: 'opaque-checking',
      maskedDisplayName: 'Checking •1234',
      suggestedLocalName: 'Checking',
      statementType: 'bank',
      accountType: 'CHECKING',
      currency: 'USD',
      transactionCount: 2,
      netImportedAmount: '-12.5',
      ledgerBalance: '250',
    },
    {
      sourceAccountKey: 'opaque-card',
      maskedDisplayName: 'Card •9876',
      suggestedLocalName: 'Card',
      statementType: 'credit-card',
      accountType: 'CREDITCARD',
      currency: 'USD',
      transactionCount: 1,
      netImportedAmount: '-5',
    },
  ],
  transactions: [],
  warnings: [],
  dateRange: null,
  formatVersion: '2.0',
  financialInstitutionName: 'Bank',
};

const LEASE: ResourceLease = {
  expiresAt: '2026-09-01T00:30:00.000Z',
  maxExpiresAt: '2026-09-01T04:00:00.000Z',
  expiresInMs: 1_800_000,
  maxExpiresInMs: 14_400_000,
};
const UPLOAD_RESPONSE: OfxUploadResponse = { uploadId: 'upload-1', result: PARSE_RESULT, lease: LEASE };

async function uploadedStore() {
  mockUpload.mockResolvedValue(UPLOAD_RESPONSE);
  const store = useImportOfxStore();
  await store.uploadFile({ file: new File(['ofx'], 'statement.ofx') });
  return store;
}

describe('useImportOfxStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient();
    mockProgress = ref(null);
    mockExecuteError = ref(null);
    mockStart = vi.fn();
    mockSetExecuteError = vi.fn();
    mockRecalculateBalance.value = false;
    setActivePinia(createPinia());
  });

  it('keys mappings by the opaque source account key and auto-matches by the suggested name', async () => {
    const store = await uploadedStore();

    expect(store.accountMapping).toEqual({
      'opaque-checking': { action: 'link-existing', accountId: '42' },
      'opaque-card': { action: 'create-new', name: 'Card', currencyCode: 'USD', currentBalance: null },
    });
    expect(store.currentStepKey).toBe('resolve');
  });

  it('does not apply the OFX ledger balance without an explicit user decision', async () => {
    const store = await uploadedStore();
    store.setAccountAction({ name: 'opaque-checking', action: 'create-new' });

    expect(store.accountMapping['opaque-checking']).toEqual(expect.objectContaining({ currentBalance: null }));
  });

  it('sends opaque mappings to duplicate detection', async () => {
    const store = await uploadedStore();
    mockDetect.mockResolvedValue({ duplicates: [] });

    await store.detectDuplicates();

    expect(mockDetect).toHaveBeenCalledWith({
      uploadId: 'upload-1',
      accountMapping: expect.objectContaining({ 'opaque-checking': { action: 'link-existing', accountId: '42' } }),
    });
    expect(store.currentStepKey).toBe('review');
  });

  it('blocks an unresolved link before it reaches the API', async () => {
    const store = await uploadedStore();
    store.setAccountAction({ name: 'opaque-checking', action: 'link-existing' });

    await expect(store.detectDuplicates()).rejects.toThrow(/no selected target/);
    expect(mockDetect).not.toHaveBeenCalled();
  });

  it('enqueues only once and sends duplicate overrides and the balance choice', async () => {
    const store = await uploadedStore();
    store.duplicates = [{ rowIndex: 3 } as never, { rowIndex: 7 } as never];
    store.toggleDuplicateUnmark({ rowIndex: 7 });
    store.recalculateBalance = true;
    mockExecute.mockResolvedValue({ jobId: 'job-1' });

    await Promise.all([store.execute(), store.execute()]);

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicateIndices: [3], recalculateBalance: true }),
    );
    expect(mockStart).toHaveBeenCalledWith({
      initialProgress: { jobId: 'job-1', status: 'queued', processedCount: 0, totalCount: 0 },
    });
    expect(store.currentStepKey).toBe('results');
  });
});
