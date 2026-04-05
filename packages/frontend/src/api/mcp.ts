import { api, API_HTTP } from '@/api/_api';

interface ConnectedApp {
  clientId: string;
  name: string | null;
  icon: string | null;
  scopes: string[];
  connectedAt: string;
  lastUsedAt: string | null;
}

export const getConnectedApps = async (): Promise<ConnectedApp[]> => {
  return api.get('/user/settings/mcp/connected-apps');
};

export const revokeConnectedApp = async ({ clientId }: { clientId: string }): Promise<{ success: boolean }> => {
  return api.delete(`/user/settings/mcp/connected-apps/${clientId}`);
};

export const getOAuthClientName = async ({ clientId }: { clientId: string }): Promise<{ name: string | null }> => {
  return api.get(`/auth/oauth2/client-info?client_id=${encodeURIComponent(clientId)}`);
};

export function getMcpServerUrl(): string {
  if (import.meta.env.VITE_MCP_BASE_URL) {
    return `${import.meta.env.VITE_MCP_BASE_URL}/mcp`;
  }
  return `${API_HTTP}/mcp`;
}

/**
 * Raw `fetch` is used intentionally here instead of the `api` client because
 * the OAuth consent flow needs access to the raw `Response` object to detect
 * HTTP redirects (`response.redirected`, `response.url`) and to read the
 * response body conditionally. The `api` client unwraps responses automatically
 * and doesn't expose the raw `Response`.
 */
export async function submitOAuthConsent({
  accept,
  oauthQuery,
}: {
  accept: boolean;
  oauthQuery: string;
}): Promise<Response> {
  return fetch(`${API_HTTP}/api/v1/auth/oauth2/consent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ accept, oauth_query: oauthQuery }),
  });
}

export function getOAuthAuthorizeUrl({ queryParams }: { queryParams: Record<string, string> }): string {
  const params = new URLSearchParams(queryParams);
  return `${API_HTTP}/api/v1/auth/oauth2/authorize?${params.toString()}`;
}
