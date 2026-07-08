import {
  type AsyncStorage,
  type PersistedQuery,
  experimental_createQueryPersister,
} from '@tanstack/query-persist-client-core';
import { type UseStore, clear, createStore, del, get, set } from 'idb-keyval';

// Discard restored entries older than a day so a user who returns after a long
// break refetches from scratch rather than seeing day-stale figures.
const MAX_PERSISTED_AGE_MS = 24 * 60 * 60 * 1000;

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
      setItem: (key, value) => set(key, value, persistedQueryStore),
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
      serialize: (persistedQuery) => JSON.stringify(persistedQuery),
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
