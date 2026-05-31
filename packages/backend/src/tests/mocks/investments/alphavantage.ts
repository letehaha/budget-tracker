import { vi } from 'vitest';

/**
 * Alias mock for `alphavantage` (default export is a factory returning the API).
 *
 * Wired via `resolve.alias` in vitest.config.e2e.ts rather than `vi.mock` — the
 * e2e setup file imports the app, caching the real module before a `vi.mock`
 * factory could register. A Vite alias swaps at resolution time, so it applies.
 *
 * Returns the same API object on every call (via `mockReturnValue`) so tests can
 * grab `alpha.getMockImplementation()(...)` once and configure the nested mocks.
 */
export default vi.fn().mockReturnValue({
  data: {
    search: vi.fn(),
    quote: vi.fn(),
    daily: vi.fn(),
  },
});
