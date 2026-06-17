import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { withDeduplication } from './with-deduplication';

// `withDeduplication` short-circuits to the raw `fn` when NODE_ENV === 'test'
// (see `disableInTests`). These tests exercise the real caching/cleanup wrapper,
// so every `withDeduplication(...)` call below passes `disableInTests: false`.

/**
 * Wait a few macrotask ticks. Node reports unhandled rejections asynchronously
 * (after the microtask queue drains and the promise is observed to have no
 * handler), so a tiny delay is needed before asserting one did NOT occur.
 */
const flushMacrotasks = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('withDeduplication', () => {
  let unhandledRejections: unknown[];
  let onUnhandledRejection: (reason: unknown) => void;

  beforeEach(() => {
    unhandledRejections = [];
    onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);
  });

  afterEach(() => {
    process.off('unhandledRejection', onUnhandledRejection);
  });

  it('does not leak an unhandled rejection when fn rejects, but still rejects the caller', async () => {
    const boom = new Error('boom');
    let calls = 0;
    const fn = async (_value: string): Promise<string> => {
      calls += 1;
      throw boom;
    };
    const deduped = withDeduplication(fn, { disableInTests: false });

    // The awaited caller must still receive the rejection (error handling
    // downstream is unchanged).
    await expect(deduped('a')).rejects.toBe(boom);
    expect(calls).toBe(1);

    // The internal `.finally()` cleanup must not produce a SECOND, unhandled
    // rejection. Give Node a chance to report one if it leaked.
    await flushMacrotasks();
    expect(unhandledRejections).toEqual([]);
  });

  it('invokes fn once for two concurrent calls with the same key and both get the same result', async () => {
    let calls = 0;
    const fn = async (value: string): Promise<string> => {
      calls += 1;
      return `result:${value}`;
    };
    const deduped = withDeduplication(fn, { disableInTests: false });

    const [first, second] = await Promise.all([deduped('same'), deduped('same')]);

    expect(calls).toBe(1);
    expect(first).toBe('result:same');
    expect(second).toBe('result:same');
  });

  it('shares the rejection across concurrent callers without leaking it', async () => {
    const boom = new Error('shared boom');
    let calls = 0;
    const fn = async (_value: string): Promise<string> => {
      calls += 1;
      throw boom;
    };
    const deduped = withDeduplication(fn, { disableInTests: false });

    const first = deduped('same');
    const second = deduped('same');

    await expect(first).rejects.toBe(boom);
    await expect(second).rejects.toBe(boom);
    expect(calls).toBe(1);

    await flushMacrotasks();
    expect(unhandledRejections).toEqual([]);
  });

  it('re-invokes fn after a rejection once the cache entry is cleaned up', async () => {
    let attempt = 0;
    const fn = async (_value: string): Promise<string> => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error('first attempt fails');
      }
      return `ok:${attempt}`;
    };
    // ttl of 0 so the post-resolution cleanup timer fires on the next tick.
    const deduped = withDeduplication(fn, { disableInTests: false, ttl: 0 });

    await expect(deduped('key')).rejects.toThrow('first attempt fails');

    // Let the cleanup timer drain the cache entry.
    await flushMacrotasks();

    const result = await deduped('key');
    expect(result).toBe('ok:2');
    expect(attempt).toBe(2);

    await flushMacrotasks();
    expect(unhandledRejections).toEqual([]);
  });
});
