/**
 * Resolves the backend base URL used by the API layer, SSE, and better-auth client.
 *
 * In dev the app is often opened via a LAN IP or custom host (e.g. https://192.168.x.x:8100),
 * so the backend URL reuses the page's protocol and hostname instead of the configured one.
 * The port still comes from VITE_APP_API_HTTP: parallel worktree dev stacks run backends on
 * different ports, and a hardcoded port would send every stack's frontend to one backend.
 */

const DEFAULT_DEV_BACKEND_PORT = '8081';

export const resolveApiHttpBase = ({
  isDev,
  configuredUrl,
  pageProtocol,
  pageHostname,
}: {
  isDev: boolean;
  configuredUrl: string | undefined;
  pageProtocol: string;
  pageHostname: string;
}): string => {
  if (!isDev) return configuredUrl ?? '';

  let port = DEFAULT_DEV_BACKEND_PORT;
  if (configuredUrl) {
    try {
      port = new URL(configuredUrl).port || port;
    } catch {
      // Malformed VITE_APP_API_HTTP — keep the default dev port
    }
  }
  return `${pageProtocol}//${pageHostname}:${port}`;
};

export const API_HTTP = resolveApiHttpBase({
  isDev: import.meta.env.DEV,
  configuredUrl: import.meta.env.VITE_APP_API_HTTP,
  pageProtocol: window.location.protocol,
  pageHostname: window.location.hostname,
});

export const API_VER = import.meta.env.VITE_APP_API_VER;
