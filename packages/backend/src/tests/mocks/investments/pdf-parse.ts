import { vi } from 'vitest';

/**
 * Alias mock for `pdf-parse`, which has a known bug of opening test files on
 * import. Wired via `resolve.alias` in vitest.config.e2e.ts rather than
 * `vi.mock` — the e2e setup file imports the app, caching the real module
 * before a `vi.mock` factory could register. A Vite alias swaps at resolution
 * time, so it applies.
 */
export default vi.fn().mockResolvedValue({ text: '', numpages: 0, info: {} });
