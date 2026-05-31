import { vi } from 'vitest';

/**
 * Alias mock for `yahoo-finance2` (v3 requires instantiation).
 *
 * Wired via `resolve.alias` in vitest.config.e2e.ts rather than `vi.mock` — the
 * e2e setup file imports the app, caching the real module before a `vi.mock`
 * factory could register. A Vite alias swaps at resolution time, so it applies.
 *
 * All methods reject by default so the composite provider falls back to other
 * providers (FMP, Polygon, etc.) in existing tests. Tests that specifically
 * exercise Yahoo override these per-test via `vi.mocked(YahooFinance)`.
 */
const MockYahooFinance = vi.fn(function (this: Record<string, unknown>) {
  this.search = vi.fn().mockRejectedValue(new Error('Yahoo mock: not configured for test'));
  this.quote = vi.fn().mockRejectedValue(new Error('Yahoo mock: not configured for test'));
  this.chart = vi.fn().mockRejectedValue(new Error('Yahoo mock: not configured for test'));
});

export default MockYahooFinance;
