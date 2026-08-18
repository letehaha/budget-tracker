import { USER_ROLES } from '@bt/shared/types';

/**
 * Extract the app user ID from MCP request auth info.
 * Throws if the user is not authenticated.
 *
 * The `extra` parameter comes from the MCP SDK's RequestHandlerExtra.
 * Auth info is attached by our route handler and propagated through the SDK.
 */
export function getUserId({ extra }: { extra: { authInfo?: { extra?: { userId?: number } } } }): number {
  const userId = extra?.authInfo?.extra?.userId;
  if (!userId) {
    throw new Error('Authentication required. No user ID found in auth info.');
  }
  return userId;
}

/**
 * Assert the caller's access token was granted a specific scope.
 * Write and delete MCP tools call this after getUserId to enforce scope gating.
 * Demo users are rejected here regardless of granted scopes: read tools never call
 * this helper, so demo accounts keep read access but cannot mutate anything via MCP.
 */
export function requireScope({
  extra,
  scope,
}: {
  extra: { authInfo?: { scopes?: string[]; extra?: { role?: string } } };
  scope: string;
}): void {
  if (extra?.authInfo?.extra?.role === USER_ROLES.demo) {
    throw new Error('This action is not available in demo mode. Sign up for a free account to unlock all features.');
  }

  const scopes = extra?.authInfo?.scopes ?? [];
  if (!scopes.includes(scope)) {
    throw new Error(`Missing required scope: ${scope}. Re-connect the app and grant it.`);
  }
}

/** Return a JSON text content block for MCP tool responses. */
export function jsonContent({ data }: { data: unknown }) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Parse scope string from DB — stored as JSON array or comma-separated string.
 */
export function parseScopes({ scopes }: { scopes: string | null }): string[] {
  if (!scopes) return [];

  try {
    const parsed = JSON.parse(scopes);
    if (Array.isArray(parsed)) return parsed;
    return scopes.split(',').map((s) => s.trim());
  } catch {
    return scopes.split(',').map((s) => s.trim());
  }
}
