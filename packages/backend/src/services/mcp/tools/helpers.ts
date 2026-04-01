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
    return JSON.parse(scopes);
  } catch {
    return scopes.split(',').map((s) => s.trim());
  }
}
