import { NextFunction, Request, Response } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Opt-in request instrumentation. When `PERF_DEBUG=true`, every response carries
 * a per-request SQL round-trip count and timing so the frontend Network tab
 * shows where an endpoint spends its time. Off by default and never registered
 * in prod: {@link registerPerfQueryHooks} and the middleware are only wired up
 * when the flag is set (see setup-middleware.ts / models/index.ts), so there is
 * zero cost on the normal path.
 */
export const isPerfDebugEnabled = process.env.PERF_DEBUG === 'true';

interface PerfStore {
  /** Number of SQL round-trips issued while serving this request. */
  queries: number;
  /** Summed wall time of those round-trips (can exceed handler time when queries run in parallel). */
  dbNs: bigint;
  /** hrtime stamp taken when the request entered the middleware. */
  startNs: bigint;
}

const perfStore = new AsyncLocalStorage<PerfStore>();

// Sequelize hands the same query-options object to the before/after hook pair,
// so it keys the per-query start stamp without mutating the library object.
const queryStartNs = new WeakMap<object, bigint>();

/**
 * Global Sequelize query hooks that tally each SQL round-trip and its wall time
 * against the in-flight request's accumulator. A no-op for any query issued
 * outside a PERF_DEBUG request (background jobs, boot) because there is no store.
 */
export function registerPerfQueryHooks(sequelize: {
  addHook: (event: string, fn: (options: object) => void) => void;
}): void {
  sequelize.addHook('beforeQuery', (options: object) => {
    const store = perfStore.getStore();
    if (!store) return;
    store.queries += 1;
    queryStartNs.set(options, process.hrtime.bigint());
  });

  sequelize.addHook('afterQuery', (options: object) => {
    const store = perfStore.getStore();
    if (!store) return;
    const startedNs = queryStartNs.get(options);
    if (startedNs !== undefined) store.dbNs += process.hrtime.bigint() - startedNs;
  });
}

/**
 * Wraps each request in an async-local accumulator and stamps the totals onto
 * the response: `Server-Timing` (db + handler durations, rendered natively in
 * the browser Timing tab) plus `X-Query-Count` and `X-DB-Time-Ms`.
 *
 * The headers are written from a `writeHead` shim rather than up front because
 * the totals are only final once the handler has run — which is after the
 * response's own headers are prepared but before they flush, the last moment a
 * header can still be added.
 */
export function perfDebugMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'OPTIONS') return next();

  const store: PerfStore = { queries: 0, dbNs: 0n, startNs: process.hrtime.bigint() };

  const originalWriteHead = res.writeHead.bind(res) as (...args: unknown[]) => Response;
  res.writeHead = ((...args: unknown[]): Response => {
    if (!res.headersSent) {
      const handlerMs = Number(process.hrtime.bigint() - store.startNs) / 1e6;
      const dbMs = Number(store.dbNs) / 1e6;
      res.setHeader('X-Query-Count', String(store.queries));
      res.setHeader('X-DB-Time-Ms', dbMs.toFixed(1));
      res.setHeader('Server-Timing', `db;dur=${dbMs.toFixed(1)}, handler;dur=${handlerMs.toFixed(1)}`);
    }
    return originalWriteHead(...args);
  }) as unknown as Response['writeHead'];

  perfStore.run(store, () => next());
}
