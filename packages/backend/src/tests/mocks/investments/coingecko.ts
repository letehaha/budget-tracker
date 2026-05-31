import { vi } from 'vitest';

/**
 * Alias mock for the official CoinGecko TypeScript SDK
 * (`@coingecko/coingecko-typescript`).
 *
 * Wired via `resolve.alias` in vitest.config.e2e.ts rather than `vi.mock` — the
 * e2e setup file imports the app, caching the real module before a `vi.mock`
 * factory could register. A Vite alias swaps at resolution time, so it applies.
 *
 * The composite provider fans out to CoinGecko on every search, so methods are
 * no-ops by default (empty results); crypto-specific tests override them
 * per-suite via `vi.mocked(Coingecko).mockImplementation(...)`.
 */
// Must be a regular `function` (not an arrow): the CoinGecko provider does
// `new Coingecko(...)`, and under vitest 4 a mock's implementation is invoked
// as a constructor on `new` — an arrow function throws "is not a constructor".
const MockCoingecko = vi.fn(function () {
  return {
    search: {
      get: vi.fn().mockResolvedValue({ coins: [] }),
    },
    simple: {
      price: {
        get: vi.fn().mockResolvedValue({}),
      },
    },
    coins: {
      marketChart: {
        get: vi.fn().mockResolvedValue({ prices: [] }),
        getRange: vi.fn().mockResolvedValue({ prices: [] }),
      },
    },
  };
});

export default MockCoingecko;
