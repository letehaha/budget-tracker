import { QueryClient } from '@tanstack/vue-query';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Ref, ref } from 'vue';

import { useImportYnabStore } from './import-ynab';

// ----- module mocks -----

vi.mock('@/api/import-ynab', () => ({
  parseYnab: vi.fn(),
  executeYnabImport: vi.fn(),
  getYnabImportStatus: vi.fn(),
}));

// The store arms a `useImportJobProgress` watchdog at construction time. Mock it
// so the store builds without real SSE or timers.
let mockJobProgress: Ref<unknown>;
let mockJobExecuteError: Ref<string | null>;

vi.mock('@/composable/use-import-job-progress', () => ({
  useImportJobProgress: vi.fn(() => ({
    progress: mockJobProgress,
    executeError: mockJobExecuteError,
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

// Only referenced inside the (never-fired) onComplete callback; stubbed so the
// real modules aren't pulled in.
vi.mock('@/stores/accounts', () => ({ useAccountsStore: vi.fn(() => ({ refetchAccounts: vi.fn() })) }));
vi.mock('@/stores/categories/categories', () => ({ useCategoriesStore: vi.fn(() => ({ loadCategories: vi.fn() })) }));
vi.mock('@/stores/currencies', () => ({ useCurrenciesStore: vi.fn(() => ({ loadCurrencies: vi.fn() })) }));
vi.mock('@/stores/tags', () => ({ useTagsStore: vi.fn(() => ({ loadTags: vi.fn() })) }));

// ----- helpers -----

import * as ynabApi from '@/api/import-ynab';
import type { YnabParseAccount, YnabParseResult } from '@bt/shared/types';

const mockParse = vi.mocked(ynabApi.parseYnab);

const anAccount = ({
  originalName,
  detectedCurrency,
}: {
  originalName: string;
  detectedCurrency: string | null;
}): YnabParseAccount => ({
  originalName,
  detectedCurrency,
  startingBalance: 0,
  transactionCount: 1,
});

const aParseResult = ({ accounts }: { accounts: YnabParseAccount[] }): YnabParseResult => ({
  accounts,
  categories: [],
  payees: [],
  tagsUsed: [],
  transactions: [],
  transfers: [],
  detectedSplitCount: 0,
  warnings: [],
  dateRange: null,
});

const aFile = () => new File(['csv'], 'register.csv', { type: 'text/csv' });

/** Parses a file so `accountPicks` is seeded from the parser's currency guesses. */
const parsedStore = async ({ accounts }: { accounts: YnabParseAccount[] }) => {
  mockParse.mockResolvedValue({ result: aParseResult({ accounts }) });
  const store = useImportYnabStore();
  await store.parseFile(aFile());
  return store;
};

// ----- tests -----

describe('useImportYnabStore – skipped accounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharedQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockJobProgress = ref(null);
    mockJobExecuteError = ref<string | null>(null);
    setActivePinia(createPinia());
  });

  it('allows executing once every account resolved to a 3-letter currency', async () => {
    const store = await parsedStore({
      accounts: [
        anAccount({ originalName: 'Cash', detectedCurrency: 'USD' }),
        anAccount({ originalName: 'Savings', detectedCurrency: 'EUR' }),
      ],
    });

    expect(store.canExecute).toBe(true);
  });

  it('blocks execute on an unresolved currency and waives it once the account is skipped', async () => {
    const store = await parsedStore({
      accounts: [
        anAccount({ originalName: 'Cash', detectedCurrency: 'USD' }),
        anAccount({ originalName: 'Mystery', detectedCurrency: null }),
      ],
    });

    expect(store.canExecute).toBe(false);

    store.toggleAccountSkip({ accountName: 'Mystery' });

    expect(store.canExecute).toBe(true);
  });

  it('keeps currencyCode across a skip/unskip round trip', async () => {
    const store = await parsedStore({
      accounts: [anAccount({ originalName: 'Cash', detectedCurrency: 'EUR' })],
    });

    store.toggleAccountSkip({ accountName: 'Cash' });
    expect(store.accountPicks['Cash']).toEqual({ currencyCode: 'EUR', skip: true });

    store.toggleAccountSkip({ accountName: 'Cash' });
    expect(store.accountPicks['Cash']).toEqual({ currencyCode: 'EUR', skip: false });
    expect(store.canExecute).toBe(true);
  });

  it('lists exactly the skipped accounts in skippedAccountNames', async () => {
    const store = await parsedStore({
      accounts: [
        anAccount({ originalName: 'Cash', detectedCurrency: 'USD' }),
        anAccount({ originalName: 'Savings', detectedCurrency: 'EUR' }),
      ],
    });

    expect(store.skippedAccountNames).toEqual([]);

    store.toggleAccountSkip({ accountName: 'Savings' });
    expect(store.skippedAccountNames).toEqual(['Savings']);

    store.toggleAccountSkip({ accountName: 'Savings' });
    expect(store.skippedAccountNames).toEqual([]);
  });
});
