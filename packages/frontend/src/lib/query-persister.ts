import {
  type AsyncStorage,
  type PersistedQuery,
  experimental_createQueryPersister,
} from '@tanstack/query-persist-client-core';
import type { Query, QueryClient, QueryFunctionContext, QueryKey } from '@tanstack/vue-query';
import { type UseStore, clear, createStore, del, entries, get, set } from 'idb-keyval';

// Discard restored entries older than a day so a user who returns after a long
// break refetches from scratch rather than seeing day-stale figures.
const MAX_PERSISTED_AGE_MS = 24 * 60 * 60 * 1000;

// Deadline passed to requestIdleCallback, so the confirming refetch fires even if
// the main thread never idles.
const REVALIDATE_IDLE_TIMEOUT_MS = 2000;

// A persisted entry only earns its keep if it carries real data. An empty list or
// a null singleton captured before the user has any data – e.g. the accounts list
// fetched right after signup, before any account exists – would otherwise be
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
      // Lets `persisterGc` enumerate rows (see `collectPersistedQueryGarbage`).
      entries: () => entries<string, string>(persistedQueryStore),
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
      // `persistedQueryFn` below drives the confirming refetch on a delay instead;
      // the built-in `refetchOnRestore` fires it instantly, defeating that deferral.
      refetchOnRestore: false,
    })
  : undefined;

// Mirrors `useIdleEnabled` minus the Vue scope – runs from a query's fetch path,
// which has no component lifetime to tie a handle to.
const scheduleWhenIdle = (task: () => void): void => {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => task(), { timeout: REVALIDATE_IDLE_TIMEOUT_MS });
  } else {
    setTimeout(task, REVALIDATE_IDLE_TIMEOUT_MS);
  }
};

/**
 * The query-level persister function. Pass as the `persister` option (directly or
 * via `queryClient.setQueryDefaults`) on queries whose data is safe to restore
 * from disk. `undefined` when IndexedDB is unavailable – queries then run
 * unpersisted with no extra handling at the call site.
 *
 * A restored snapshot paints immediately, then is confirmed by one background
 * refetch on browser idle – deferred because a dashboard load already fans out
 * ~40-50 requests, and confirming immediately would put every persisted key back
 * on the critical path it was persisted to stay off. Persistence buys instant
 * paint, not fewer requests.
 *
 * Detected by whether `queryFn` ran: `persisterFn` calls it only when there's
 * nothing usable to restore. The deferred `query.fetch()` re-enters with
 * `state.data` already set, which fails that restore gate – so it runs `queryFn`
 * directly and never re-defers.
 */
export const persistedQueryFn = persister
  ? async <T, TQueryKey extends QueryKey>(
      queryFn: (context: QueryFunctionContext<TQueryKey>) => T | Promise<T>,
      context: QueryFunctionContext<TQueryKey>,
      query: Query,
    ): Promise<T> => {
      let servedFromNetwork = false;
      const trackedQueryFn = (ctx: QueryFunctionContext<TQueryKey>) => {
        servedFromNetwork = true;
        return queryFn(ctx);
      };

      const result = (await persister.persisterFn(trackedQueryFn, context, query)) as T;

      if (!servedFromNetwork) {
        // Failures surface through the query's own error state; caught only so a
        // rejected background fetch isn't an unhandled rejection.
        scheduleWhenIdle(() => void query.fetch().catch(() => {}));
      }

      return result;
    }
  : undefined;

/**
 * Persister for data that cannot change while a build is live, so a restored
 * snapshot needs no confirming request at all. `buster: __APP_VERSION__` refetches
 * it on the next deploy.
 *
 * Reserve this for genuinely immutable reference data. Anything a user, a cron, or
 * another device can write must use `persistedQueryFn` – a snapshot with no
 * revalidation is only correct if nothing can invalidate it.
 */
export const persistedImmutableQueryFn = persister?.persisterFn;

/**
 * Expire abandoned entries – rows whose key is no longer read through the
 * persister, which lazy-on-read expiry can never reach.
 */
export const collectPersistedQueryGarbage = async (): Promise<void> => {
  if (!persister) return;
  await persister.persisterGc();
};

/**
 * Wipe every persisted query entry from IndexedDB. Called on logout and when a
 * different user is detected, so one account never restores another's data.
 */
export const clearPersistedQueries = async (): Promise<void> => {
  if (!persistedQueryStore) return;
  await clear(persistedQueryStore);
};

/**
 * Full on-device query-cache teardown: cancel in-flight queries (so nothing
 * refetches and re-persists mid-teardown), drop the in-memory cache, then wipe
 * the persisted IndexedDB store. Shared by every "no cached data may survive"
 * flow – logout, user-switch, and the destructive data wipe – so none of them
 * can forget the persisted store and leave one state restoring another's data.
 */
export const resetQueryCaches = async (queryClient: QueryClient): Promise<void> => {
  queryClient.cancelQueries();
  queryClient.clear();
  await clearPersistedQueries();
};
