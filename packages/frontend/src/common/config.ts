/**
 * Runtime-configurable app settings.
 *
 * The production Docker image serves `/config.js` (written by the container
 * entrypoint) which assigns `window.__APP_CONFIG__`. That lets a self-hoster
 * override values at container start without rebuilding the bundle. Each key
 * falls back to the build-time `import.meta.env.VITE_*` value baked into the
 * bundle, and finally to a hardcoded default where one exists.
 *
 * Precedence per key: `window.__APP_CONFIG__` (runtime) → `import.meta.env`
 * (build-time) → code default. `??` is used so a runtime **empty string**
 * still wins over the baked value – an empty `apiHttp` selects same-origin
 * (relative `/api/v1`) mode.
 *
 * Reads are lazy getters, not values snapshotted at module load, so a
 * `config.x` read at point of use observes `vi.stubEnv` changes made after
 * import – prefer reading `config.x` inside functions for that reason. The
 * guarantee does not extend to modules that derive their own module-level
 * constants from `config` (e.g. `api-base-url.ts` exports `API_HTTP`
 * computed at import) – those freeze at first import.
 */

/**
 * Shape of `window.__APP_CONFIG__`. Keys use the runtime env-var names (no
 * `VITE_` prefix) – they mirror the container env vars the entrypoint reads.
 */
export interface AppRuntimeConfig {
  API_HTTP?: string;
  API_VER?: string;
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
