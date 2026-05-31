import { vi } from 'vitest';

/**
 * Alias mock for `@polygon.io/client-js`.
 *
 * Wired via `resolve.alias` in vitest.config.e2e.ts rather than `vi.mock` — the
 * e2e setup file imports the app, caching the real module before a `vi.mock`
 * factory could register. A Vite alias swaps at resolution time, so it applies.
 *
 * `restClient` returns the same API object on every call (via `mockReturnValue`)
 * so tests can grab `restClient.getMockImplementation()(...)` once and configure
 * the nested method mocks the provider will later invoke.
 */
export const restClient = vi.fn().mockReturnValue({
  reference: {
    tickers: vi.fn(),
    exchanges: vi.fn(),
  },
  stocks: {
    aggregatesGroupedDaily: vi.fn(),
    aggregates: vi.fn(),
  },
});
