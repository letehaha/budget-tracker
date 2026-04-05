import { authPool } from '@config/auth';
import { ConnectedApp } from '@services/mcp/connected-apps';
import * as helpers from '@tests/helpers';
import { CustomResponse } from '@tests/helpers';

export async function getOAuthClientInfo({
  clientId,
}: {
  clientId?: string;
}): Promise<CustomResponse<{ name: string | null }>> {
  const url = clientId
    ? `/auth/oauth2/client-info?client_id=${encodeURIComponent(clientId)}`
    : '/auth/oauth2/client-info';

  const result = await helpers.makeRequest({
    method: 'get',
    url,
    raw: false,
  });

  return result;
}

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

// ── Test OAuth data helpers ──────────────────────────────────────────────

const TEST_AUTH_USER_ID = 'test-user-id';

interface TestOAuthClientData {
  id: string;
  clientId: string;
  name: string;
  redirectUris: string;
  scopes: string;
}

/**
 * Insert a test OAuth client into `ba_oauth_client`.
 * Returns the inserted row data for use in subsequent helpers.
 */
export async function createTestOAuthClient({
  id = 'test-internal-client-id',
  clientId = 'test-public-client-id',
  name = 'Test MCP App',
  redirectUris = 'https://example.com/callback',
  scopes = '["finance:read","profile:read"]',
}: Partial<TestOAuthClientData> = {}): Promise<TestOAuthClientData> {
  await authPool.query(
    `INSERT INTO "ba_oauth_client" (id, "clientId", name, "redirectUris", scopes, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [id, clientId, name, redirectUris, scopes],
  );

  return { id, clientId, name, redirectUris, scopes };
}

/**
 * Insert a test OAuth consent record into `ba_oauth_consent`.
 * Note: `clientId` here stores the **public clientId** (from `ba_oauth_client.clientId`).
 */
export async function createTestOAuthConsent({
  id = 'test-consent-id',
  clientId = 'test-public-client-id',
  userId = TEST_AUTH_USER_ID,
  scopes = '["finance:read","profile:read"]',
}: {
  id?: string;
  clientId?: string;
  userId?: string;
  scopes?: string;
} = {}): Promise<void> {
  await authPool.query(
    `INSERT INTO "ba_oauth_consent" (id, "clientId", "userId", scopes, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [id, clientId, userId, scopes],
  );
}

/**
 * Insert a test OAuth access token into `ba_oauth_access_token`.
 * Note: `clientId` here stores the **internal id** (from `ba_oauth_client.id`).
 */
export async function createTestOAuthAccessToken({
  id = 'test-access-token-id',
  token = 'test-access-token-value',
  clientId = 'test-internal-client-id',
  userId = TEST_AUTH_USER_ID,
  scopes = '["finance:read","profile:read"]',
}: {
  id?: string;
  token?: string;
  clientId?: string;
  userId?: string;
  scopes?: string;
} = {}): Promise<void> {
  await authPool.query(
    `INSERT INTO "ba_oauth_access_token" (id, token, "clientId", "userId", scopes, "expiresAt", "createdAt")
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '1 day', NOW())
     ON CONFLICT DO NOTHING`,
    [id, token, clientId, userId, scopes],
  );
}

/**
 * Clean up all test OAuth data from auth tables.
 * Deletes in dependency order to avoid FK constraint errors.
 */
export async function cleanupTestOAuthData(): Promise<void> {
  await authPool.query(`DELETE FROM "ba_oauth_access_token" WHERE "userId" = $1`, [TEST_AUTH_USER_ID]);
  await authPool.query(`DELETE FROM "ba_oauth_refresh_token" WHERE "userId" = $1`, [TEST_AUTH_USER_ID]);
  await authPool.query(`DELETE FROM "ba_oauth_consent" WHERE "userId" = $1`, [TEST_AUTH_USER_ID]);
  await authPool.query(`DELETE FROM "ba_oauth_client" WHERE id = 'test-internal-client-id'`);
}

/**
 * Query the auth DB to count remaining OAuth records for the test user.
 * Useful for asserting that revocation cleaned up all records.
 */
export async function getTestOAuthRecordCounts({ internalClientId }: { internalClientId: string }): Promise<{
  accessTokens: number;
  consents: number;
}> {
  const accessTokenResult = await authPool.query(
    `SELECT COUNT(*)::int AS count FROM "ba_oauth_access_token" WHERE "clientId" = $1 AND "userId" = $2`,
    [internalClientId, TEST_AUTH_USER_ID],
  );
  const consentResult = await authPool.query(
    `SELECT COUNT(*)::int AS count FROM "ba_oauth_consent" WHERE "userId" = $1`,
    [TEST_AUTH_USER_ID],
  );

  return {
    accessTokens: accessTokenResult.rows[0]?.count ?? 0,
    consents: consentResult.rows[0]?.count ?? 0,
  };
}
