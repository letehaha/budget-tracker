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

export function getMcpServerUrl(): string {
  return `${API_HTTP}/api/v1/mcp`;
}

export async function submitOAuthConsent({ code, accept }: { code: string; accept: boolean }): Promise<Response> {
  return fetch(`${API_HTTP}/api/v1/auth/oauth2/consent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ code, accept }),
  });
}
