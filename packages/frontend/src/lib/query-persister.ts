import {
  type AsyncStorage,
  type PersistedQuery,
  experimental_createQueryPersister,
} from '@tanstack/query-persist-client-core';
import { type UseStore, clear, createStore, del, get, set } from 'idb-keyval';

// Discard restored entries older than a day so a user who returns after a long
// break refetches from scratch rather than seeing day-stale figures.
const MAX_PERSISTED_AGE_MS = 24 * 60 * 60 * 1000;

// A persisted entry only earns its keep if it carries real data. An empty list or
// a null singleton captured before the user has any data — e.g. the accounts list
// fetched right after signup, before any account exists — would otherwise be
// restored on the next load and, because whitelisted queries use `staleTime:
// Infinity`, be treated as fresh. Data created out-of-band in the meantime (another
// device, an import) would then stay invisible until the 24h maxAge elapses. Skip
// persisting those snapshots so the next load refetches instead.
const isEmptyQueryData = (data: unknown): boolean => data == null || (Array.isArray(data) && data.length === 0);

// Returned by `serialize` for a snapshot not worth persisting. `setItem` treats it
// as "drop any existing entry and write nothing". `JSON.stringify` never yields an
// empty string, so this can't collide with a real serialized payload.
const SKIP_PERSIST_SENTINEL = '';

// Persistence lives in IndexedDB; guard the SSR / privacy-mode cases where the
// API is missing so whitelisted queries still work, just unpersisted.
const isBrowserPersistenceAvailable = (): boolean => typeof window !== 'undefined' && typeof indexedDB !== 'undefined';

// Dedicated database + object store isolates the persisted query cache from any
// other idb-keyval usage, so it can be wiped wholesale on logout / user switch.
const persistedQueryStore: UseStore | undefined = isBrowserPersistenceAvailable()
  ? createStore('budget-tracker', 'query-cache')
  : undefined;

const idbStorage: AsyncStorage<string> | undefined = persistedQueryStore
  ? {
      getItem: (key) => get<string>(key, persistedQueryStore),
      setItem: (key, value) =>
        value === SKIP_PERSIST_SENTINEL ? del(key, persistedQueryStore) : set(key, value, persistedQueryStore),
      removeItem: (key) => del(key, persistedQueryStore),
    }
  : undefined;

const persister = idbStorage
  ? experimental_createQueryPersister<string>({
      storage: idbStorage,
      maxAge: MAX_PERSISTED_AGE_MS,
      // Bust every persisted entry when a new build ships: __APP_VERSION__ is the
      // commit hash baked into the bundle, so a deploy invalidates stale shapes.
      buster: __APP_VERSION__,
      serialize: (persistedQuery) =>
        isEmptyQueryData(persistedQuery.state.data) ? SKIP_PERSIST_SENTINEL : JSON.stringify(persistedQuery),
      deserialize: (cached) => JSON.parse(cached) as PersistedQuery,
    })
  : undefined;

/**
 * The query-level persister function. Pass as the `persister` option (directly or
 * via `queryClient.setQueryDefaults`) on queries whose data is safe to restore
 * from disk. `undefined` when IndexedDB is unavailable — queries then run
 * unpersisted with no extra handling at the call site.
 */
export const persistedQueryFn = persister?.persisterFn;

/**
 * Wipe every persisted query entry from IndexedDB. Called on logout and when a
 * different user is detected, so one account never restores another's data.
 */
export const clearPersistedQueries = async (): Promise<void> => {
  if (!persistedQueryStore) return;
  await clear(persistedQueryStore);
};
