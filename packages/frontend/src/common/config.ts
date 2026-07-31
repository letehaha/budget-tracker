/**
 * Runtime-configurable app settings.
 *
 * Per key: `window.__APP_CONFIG__` (Docker entrypoint writes `/config.js`) →
 * `import.meta.env` (dev only, no entrypoint) → code default. `??` so a runtime
 * empty string still wins: an empty `apiHttp` selects same-origin (relative
 * `/api/v1`) mode.
 *
 * Getters are lazy: read `config.x` inside a function to see `vi.stubEnv` changes
 * made after import. Constants derived from `config` at module level (e.g.
 * `API_HTTP` in `api-base-url.ts`) freeze at first import.
 */

/** Shape of `window.__APP_CONFIG__`. Keys use runtime env-var names, no `VITE_` prefix. */
interface AppRuntimeConfig {
  API_HTTP?: string;
  API_VER?: string;
  IS_SELF_HOST?: string;
  MCP_BASE_URL?: string;
  POSTHOG_KEY?: string;
  POSTHOG_HOST?: string;
  LOGO_DEV_TOKEN?: string;
  SENTRY_DSN?: string;
  SENTRY_RELEASE?: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: AppRuntimeConfig;
  }
}

const runtime = (): AppRuntimeConfig => (typeof window !== 'undefined' && window.__APP_CONFIG__) || {};

export const config = {
  get apiHttp(): string | undefined {
    return runtime().API_HTTP ?? import.meta.env.VITE_APP_API_HTTP;
  },
  get apiVer(): string {
    return runtime().API_VER ?? import.meta.env.VITE_APP_API_VER ?? '/api/v1';
  },
  /**
   * Only the exact string `'true'` is on, mirroring the backend. No
   * `import.meta.env` fallback: hosted and self-hosted run the same image, and a
   * `VITE_` var is inlined at build time, so one bundle could not answer
   * differently for the two.
   */
  get isSelfHost(): boolean {
    return runtime().IS_SELF_HOST === 'true';
  },
  get mcpBaseUrl(): string | undefined {
    return runtime().MCP_BASE_URL ?? import.meta.env.VITE_MCP_BASE_URL;
  },
  get posthogKey(): string | undefined {
    return runtime().POSTHOG_KEY ?? import.meta.env.VITE_POSTHOG_KEY;
  },
  get posthogHost(): string | undefined {
    return runtime().POSTHOG_HOST ?? import.meta.env.VITE_POSTHOG_HOST;
  },
  get logoDevToken(): string | undefined {
    return runtime().LOGO_DEV_TOKEN ?? import.meta.env.VITE_LOGO_DEV_TOKEN;
  },
  get sentryDsn(): string | undefined {
    return runtime().SENTRY_DSN ?? import.meta.env.VITE_SENTRY_DSN;
  },
  get sentryRelease(): string | undefined {
    return runtime().SENTRY_RELEASE ?? import.meta.env.VITE_SENTRY_RELEASE;
  },
};
