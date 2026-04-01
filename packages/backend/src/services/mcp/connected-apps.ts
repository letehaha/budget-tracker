import { authPool } from '@config/auth';
import { NotFoundError } from '@js/errors';
import { parseScopes } from '@services/mcp/tools/helpers';

export interface ConnectedApp {
  clientId: string;
  name: string | null;
  icon: string | null;
  scopes: string[];
  connectedAt: string;
  lastUsedAt: string | null;
}

interface ConnectedAppRow {
  clientId: string;
  name: string | null;
  icon: string | null;
  scopes: string | null;
  connectedAt: string;
  lastUsedAt: string | null;
}

interface ClientIdRow {
  id: string;
}

/**
 * List all OAuth clients that have active tokens for a given user.
 */
export async function getConnectedApps({ authUserId }: { authUserId: string }): Promise<ConnectedApp[]> {
  const result = await authPool.query<ConnectedAppRow>(
    `SELECT DISTINCT
       c."clientId",
       c."name",
       c."icon",
       con."scopes",
       con."createdAt" AS "connectedAt",
       (
         SELECT MAX(at."createdAt")
         FROM "ba_oauth_access_token" at
         WHERE at."clientId" = c."id" AND at."userId" = $1
       ) AS "lastUsedAt"
     FROM "ba_oauth_consent" con
     JOIN "ba_oauth_client" c ON con."clientId" = c."id"
     WHERE con."userId" = $1
     ORDER BY con."createdAt" DESC`,
    [authUserId],
  );

  return result.rows.map((row) => ({
    clientId: row.clientId,
    name: row.name,
    icon: row.icon,
    scopes: parseScopes({ scopes: row.scopes }),
    connectedAt: row.connectedAt,
    lastUsedAt: row.lastUsedAt,
  }));
}

/**
 * Revoke all OAuth tokens and consent for a specific client + user combination.
 */
export async function revokeConnectedApp({
  authUserId,
  clientId,
}: {
  authUserId: string;
  clientId: string;
}): Promise<void> {
  // Get the internal client ID from the public clientId
  const clientResult = await authPool.query<ClientIdRow>(
    `SELECT "id" FROM "ba_oauth_client" WHERE "clientId" = $1 LIMIT 1`,
    [clientId],
  );

  if (clientResult.rows.length === 0) {
    throw new NotFoundError({ message: 'Client not found' });
  }

  const internalClientId = clientResult.rows[0]!.id;

  // Delete all tokens and consent in a transaction
  const client = await authPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM "ba_oauth_access_token" WHERE "clientId" = $1 AND "userId" = $2`, [
      internalClientId,
      authUserId,
    ]);
    await client.query(`DELETE FROM "ba_oauth_refresh_token" WHERE "clientId" = $1 AND "userId" = $2`, [
      internalClientId,
      authUserId,
    ]);
    await client.query(`DELETE FROM "ba_oauth_consent" WHERE "clientId" = $1 AND "userId" = $2`, [
      internalClientId,
      authUserId,
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
