/**
 * Runtime-configurable landing settings.
 *
 * The production Docker image serves `/config.js` (written by the container
 * entrypoint) which assigns `window.__APP_CONFIG__`. nginx resolves `/config.js`
 * through an exact-match location rooted at the SPA's directory, so the landing
 * pages reach the same file the SPA does — one config for both bundles.
 *
 * Each key falls back to the build-time `import.meta.env.VITE_*` value, which is
 * what `astro dev` uses: there is no entrypoint locally, so `public/config.js`
 * ships an empty `window.__APP_CONFIG__` and the `.env.development` values win.
 *
 * Reads are lazy getters rather than module-load snapshots so an island that
 * hydrates after `/config.js` has executed still observes the runtime values.
 * Read `config.x` at point of use, not into a module-level constant.
 *
 * Keys mirror the container env-var names (no `VITE_` prefix) and are a subset
 * of the SPA's `AppRuntimeConfig` — the landing only needs the API origin and
 * analytics.
 */
export interface LandingRuntimeConfig {
  API_HTTP?: string;
  API_VER?: string;
  POSTHOG_KEY?: string;
  POSTHOG_HOST?: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: LandingRuntimeConfig;
  }
}

const runtime = (): LandingRuntimeConfig => (typeof window !== 'undefined' && window.__APP_CONFIG__) || {};

export const config = {
  /** Empty selects same-origin mode: relative `/api/v1` proxied by nginx. */
  get apiHttp(): string {
    return runtime().API_HTTP ?? import.meta.env.VITE_APP_API_HTTP ?? '';
  },
  get apiVer(): string {
    return runtime().API_VER ?? import.meta.env.VITE_APP_API_VER ?? '/api/v1';
  },
  get posthogKey(): string | undefined {
    return runtime().POSTHOG_KEY ?? import.meta.env.VITE_POSTHOG_KEY;
  },
  get posthogHost(): string | undefined {
    return runtime().POSTHOG_HOST ?? import.meta.env.VITE_POSTHOG_HOST;
  },
};
