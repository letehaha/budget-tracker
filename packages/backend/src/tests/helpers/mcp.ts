import { ConnectedApp } from '@services/mcp/connected-apps';
import * as helpers from '@tests/helpers';
import { CustomResponse } from '@tests/helpers';

export async function getConnectedApps({ raw }: { raw?: false }): Promise<CustomResponse<ConnectedApp[]>>;
export async function getConnectedApps({ raw }: { raw?: true }): Promise<ConnectedApp[]>;
export async function getConnectedApps({
  raw = true,
}: {
  raw?: boolean;
} = {}): Promise<CustomResponse<ConnectedApp[]> | ConnectedApp[]> {
  const result = await helpers.makeRequest({
    method: 'get',
    url: '/user/settings/mcp/connected-apps',
    raw,
  });

  return result;
}

export async function revokeConnectedApp({
  clientId,
  raw,
}: {
  clientId: string;
  raw?: false;
}): Promise<CustomResponse<{ success: boolean }>>;
export async function revokeConnectedApp({
  clientId,
  raw,
}: {
  clientId: string;
  raw?: true;
}): Promise<{ success: boolean }>;
export async function revokeConnectedApp({
  clientId,
  raw = true,
}: {
  clientId: string;
  raw?: boolean;
}): Promise<CustomResponse<{ success: boolean }> | { success: boolean }> {
  const result = await helpers.makeRequest({
    method: 'delete',
    url: `/user/settings/mcp/connected-apps/${clientId}`,
    raw,
  });

  return result;
}
