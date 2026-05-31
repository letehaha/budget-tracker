import { vi } from 'vitest';

/**
 * Alias mock for the FMP client (`data-providers/clients/fmp-client`).
 *
 * Wired via `resolve.alias` in vitest.config.e2e.ts rather than `vi.mock`,
 * because the e2e setup file imports the whole app, which loads the real
 * provider clients into the module cache before any `vi.mock` factory can
 * register — Vitest then refuses to replace already-cached modules. A Vite
 * alias swaps the module at resolution time (before the cache), so it always
 * applies. See setupIntegrationTests.ts for the full explanation.
 *
 * Tests drive this per-test via `vi.mocked(FmpClient).mockImplementation(...)`.
 */
export const FmpClient = vi.fn(function (this: Record<string, unknown>) {
  this.search = vi.fn();
  this.getQuote = vi.fn();
  this.getHistoricalPrices = vi.fn();
  this.getHistoricalPricesFull = vi.fn();
});
