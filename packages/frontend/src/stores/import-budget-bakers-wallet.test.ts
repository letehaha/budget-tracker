import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Ref, defineComponent, ref } from 'vue';

import { useImportBudgetBakersWalletStore } from './import-budget-bakers-wallet';

// ----- module mocks -----

// The store calls these inside its async actions; mocked so the parse + resolve
// flow runs without touching the network.
vi.mock('@/api/import-budget-bakers-wallet', () => ({
  parseBudgetBakersWallet: vi.fn(),
  detectBudgetBakersWalletDuplicates: vi.fn(),
  executeBudgetBakersWalletImport: vi.fn(),
  getBudgetBakersWalletImportStatus: vi.fn(),
}));

// `parseFiles` merges the selected files client-side via a dynamic import before
// parsing. Mock the merge so the test feeds a fixed `combinedContent` and the
// flow reaches the parse + seed step deterministically (the store reads only
// `combinedContent` off the result).
vi.mock('@/pages/import-export/utils/merge-csv-files', () => ({
  mergeCsvFiles: vi.fn(() => Promise.resolve({ combinedContent: 'csv' })),
}));

// The execute action arms a `useImportJobProgress` watchdog at construction time.
// Mock it so the store builds without real SSE/timers — only the parse/resolve
// path is under test here.
let mockJobProgress: Ref<unknown>;
let mockJobExecuteError: Ref<string | null>;

vi.mock('@/composable/use-import-job-progress', () => ({
  useImportJobProgress: vi.fn(() => ({
    progress: mockJobProgress,
    executeError: mockJobExecuteError,
    setExecuteError: vi.fn(),
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
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: vi.fn(() => ({
    accounts: [{ id: 1, name: 'Cash', currencyCode: 'USD' }],
    isAccountsFetched: true,
    refetchAccounts: vi.fn(),
  })),
}));

vi.mock('@/stores/categories/categories', () => ({
  useCategoriesStore: vi.fn(() => ({
    categories: [{ id: 'cat-groceries', name: 'Groceries', subCategories: [] }],
    formattedCategories: [{ id: 'cat-groceries', name: 'Groceries', subCategories: [] }],
    loadCategories: vi.fn(),
  })),
}));

// Only referenced inside the (never-fired) onComplete callback; stubbed so the
// real modules aren't pulled in.
vi.mock('@/stores/currencies', () => ({ useCurrenciesStore: vi.fn(() => ({ loadCurrencies: vi.fn() })) }));
vi.mock('@/stores/tags', () => ({ useTagsStore: vi.fn(() => ({ loadTags: vi.fn() })) }));

// ----- helpers -----

import * as walletApi from '@/api/import-budget-bakers-wallet';
import type { BudgetBakersWalletParseResult } from '@bt/shared/types';

const mockParse = vi.mocked(walletApi.parseBudgetBakersWallet);

/**
 * A parse result with one account and one category that exactly match an
 * existing app entity, plus a category that matches nothing.
 */
const PARSE_RESULT: BudgetBakersWalletParseResult = {
  accounts: [{ originalName: 'Cash', currency: 'USD', transactionCount: 3, netImportedAmount: -10 }],
  categories: [
    { name: 'Groceries', transactionCount: 2 },
    { name: 'Brand New Category', transactionCount: 1 },
  ],
  tags: [],
  transactions: [],
  transfers: [],
  warnings: [],
  dateRange: null,
  detectedBaseCurrency: null,
};

const mountWithPlugins = () => {
  sharedQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockJobProgress = ref(null);
  mockJobExecuteError = ref<string | null>(null);

  const pinia = createPinia();
  setActivePinia(pinia);
  const Wrapper = defineComponent({ setup() {}, template: '<div />' });
  mount(Wrapper, { global: { plugins: [pinia, [VueQueryPlugin, { queryClient: sharedQueryClient }]] } });
};

const aFile = () => new File(['csv'], 'wallet.csv', { type: 'text/csv' });

// ----- tests -----

describe('useImportBudgetBakersWalletStore – resolve seeding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mountWithPlugins();
  });

  it('auto-links exact-name matches on parse instead of defaulting them to create-new', async () => {
    mockParse.mockResolvedValue({ result: PARSE_RESULT });

    const store = useImportBudgetBakersWalletStore();
    await store.parseFiles({ files: [aFile()] });

    // Regression guard: an exact-name category match must auto-link, not sit at
    // create-new (which forced the user to manually click "Map exact matches").
    expect(store.categoryMapping['Groceries']).toEqual({ action: 'link-existing', categoryId: 'cat-groceries' });
    // The exact-name account match auto-links too (currency-aware).
    expect(store.accountMapping['Cash']).toEqual({ action: 'link-existing', accountId: '1' });
  });

  it('falls back to create-new for sources with no existing match', async () => {
    mockParse.mockResolvedValue({ result: PARSE_RESULT });

    const store = useImportBudgetBakersWalletStore();
    await store.parseFiles({ files: [aFile()] });

    expect(store.categoryMapping['Brand New Category']).toEqual({ action: 'create-new' });
  });
});
