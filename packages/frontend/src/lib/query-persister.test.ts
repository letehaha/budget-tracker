import { QueryClient, type QueryFunction, type QueryKey } from '@tanstack/vue-query';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// idb-keyval backed by an in-memory Map so the persister's reads/writes are
// observable without a real IndexedDB. `vi.hoisted` makes the Map reachable from
// the hoisted mock factory.
const { memory } = vi.hoisted(() => ({ memory: new Map<string, string>() }));

vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: async (key: string) => memory.get(key),
  set: async (key: string, value: string) => {
    memory.set(key, value);
  },
  del: async (key: string) => {
    memory.delete(key);
  },
  clear: async () => {
    memory.clear();
  },
}));

// The persister persists on a scheduled macrotask, so let the queue drain before
// asserting on storage / simulating a reload.
const flushScheduler = () => new Promise((resolve) => setTimeout(resolve, 0));

let persistedQueryFn: NonNullable<Awaited<ReturnType<typeof loadModule>>['persistedQueryFn']>;

const loadModule = () => import('@/lib/query-persister');

// A fresh QueryClient shares the in-memory `memory` store but starts with an empty
// in-memory cache — i.e. what a full page reload gives you.
const freshClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const fetchThrough = <T>(client: QueryClient, queryKey: QueryKey, queryFn: QueryFunction<T>) =>
  client.fetchQuery({ queryKey, queryFn, persister: persistedQueryFn, staleTime: Infinity });

beforeAll(async () => {
  // jsdom ships no IndexedDB; presence is all the availability guard checks.
  vi.stubGlobal('indexedDB', {});
  const mod = await loadModule();
  if (!mod.persistedQueryFn) throw new Error('persister should be enabled when indexedDB is present');
  persistedQueryFn = mod.persistedQueryFn;
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  memory.clear();
});

describe('query persister — empty snapshots are not persisted', () => {
  it('does not persist an empty list result', async () => {
    await fetchThrough(freshClient(), ['accounts'], async () => []);
    await flushScheduler();

    expect(memory.size).toBe(0);
  });

  it('does not persist a null singleton result', async () => {
    await fetchThrough(freshClient(), ['base-currency'], async () => null);
    await flushScheduler();

    expect(memory.size).toBe(0);
  });

  it('persists a non-empty list result', async () => {
    await fetchThrough(freshClient(), ['portfolios'], async () => [{ id: 1 }]);
    await flushScheduler();

    expect(memory.size).toBe(1);
  });

  it('drops a previously-persisted entry once its list becomes empty in-session', async () => {
    // Same client throughout: the query already holds data, so a refetch runs the
    // queryFn (rather than restoring from disk) — the path a user hits by deleting
    // their last account. The now-empty result must prune the stale disk entry.
    const client = freshClient();
    let result: { id: number }[] = [{ id: 1 }];

    await fetchThrough(client, ['accounts'], async () => result);
    await flushScheduler();
    expect(memory.size).toBe(1);

    result = [];
    await client.refetchQueries({ queryKey: ['accounts'] });
    await flushScheduler();
    expect(memory.size).toBe(0);
  });
});

describe('query persister — restore behaviour across a reload', () => {
  it('refetches after an empty snapshot so data seeded out-of-band appears', async () => {
    // First load: user has no accounts yet -> empty result, nothing persisted.
    await fetchThrough(freshClient(), ['accounts'], async () => []);
    await flushScheduler();

    // Accounts get created out-of-band (another device / an import / API seeding),
    // then the app reloads. With nothing restorable, the query must refetch.
    let calls = 0;
    const data = await fetchThrough(freshClient(), ['accounts'], async () => {
      calls += 1;
      return [{ id: 'seeded' }];
    });

    expect(calls).toBe(1);
    expect(data).toEqual([{ id: 'seeded' }]);
  });

  it('restores a non-empty snapshot from disk without refetching', async () => {
    await fetchThrough(freshClient(), ['portfolios'], async () => [{ id: 1 }]);
    await flushScheduler();

    let calls = 0;
    const data = await fetchThrough(freshClient(), ['portfolios'], async () => {
      calls += 1;
      return [];
    });

    expect(calls).toBe(0);
    expect(data).toEqual([{ id: 1 }]);
  });
});
