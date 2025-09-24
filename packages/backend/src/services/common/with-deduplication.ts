type AsyncFunction<T extends unknown[], R> = (...args: T) => Promise<R>;

interface DeduplicationOptions<T extends unknown[]> {
  /**
   * Custom function to generate cache keys from function arguments.
   * If not provided, uses JSON.stringify(args)
   */
  keyGenerator?: (...args: T) => string;

  /**
   * Time in milliseconds to keep completed promises in cache after resolution.
   * This helps handle race conditions where new requests come in just as previous ones complete.
   * Default: 1000ms (1 second)
   */
  ttl?: number;

  /**
   * Maximum number of entries to keep in cache to prevent memory leaks.
   * When exceeded, oldest entries are removed.
   * Default: 100
   */
  maxCacheSize?: number;

  /**
   * Whether to disable deduplication in test environment.
   * This prevents test interference and memory leaks from timers.
   * Default: true
   */
  disableInTests?: boolean;
}

/**
 * Higher-order function that prevents duplicate execution of async functions
 * with identical parameters by caching in-flight promises.
 *
 * This is useful for expensive operations (database queries, API calls) that
 * might be called concurrently with the same parameters.
 *
 * Example:
 * ```typescript
 * const expensiveFunction = withDeduplication(async (id: number) => {
 *   return await database.query('SELECT * FROM table WHERE id = ?', [id]);
 * });
 *
 * // These two calls will only execute the database query once
 * Promise.all([
 *   expensiveFunction(123),
 *   expensiveFunction(123)
 * ]);
 * ```
 */
export function withDeduplication<T extends unknown[], R>(
  fn: AsyncFunction<T, R>,
  options: DeduplicationOptions<T> = {},
): AsyncFunction<T, R> {
  const {
    keyGenerator = (...args: T) => JSON.stringify(args),
    ttl = 1000,
    maxCacheSize = 100,
    disableInTests = true,
  } = options;

  // If in test environment and disableInTests is true, return original function
  if (disableInTests && process.env.NODE_ENV === 'test') {
    return fn;
  }

  const cache = new Map<string, Promise<R>>();
  const insertionOrder: string[] = [];

  const cleanupExpiredEntry = (key: string) => {
    setTimeout(() => {
      cache.delete(key);
      const index = insertionOrder.indexOf(key);
      if (index > -1) {
        insertionOrder.splice(index, 1);
      }
    }, ttl);
  };

  const enforceMaxCacheSize = () => {
    while (insertionOrder.length >= maxCacheSize) {
      const oldestKey = insertionOrder.shift();
      if (oldestKey) {
        cache.delete(oldestKey);
      }
    }
  };

  return async (...args: T): Promise<R> => {
    const key = keyGenerator(...args);

    // Return existing promise if found
    if (cache.has(key)) {
      return cache.get(key)!;
    }

    // Enforce cache size limit
    enforceMaxCacheSize();

    // Create new promise and cache it
    const promise = fn(...args);
    cache.set(key, promise);
    insertionOrder.push(key);

    // Schedule cleanup after promise resolves/rejects
    promise.finally(() => {
      cleanupExpiredEntry(key);
    });

    return promise;
  };
}
