import { Express, Request, Response } from 'express';

import { API_PREFIX, MCP_BASE_URL } from '../config';

const MCP_SCOPES_SUPPORTED = ['finance:read', 'finance:write', 'finance:delete', 'profile:read', 'offline_access'];

/**
 * Set up OAuth discovery and metadata routes required by MCP clients.
 *
 * These are mounted at root-level well-known paths (RFC 9728, RFC 8414)
 * and cannot live under a prefixed Router.
 *
 * Keep in sync with static mirrors on the landing domain (nginx config):
 *   - packages/frontend/public/.well-known/oauth-authorization-server
 *   - packages/frontend/public/.well-known/oauth-protected-resource
 * Any change to issuer, endpoints, or scopes here must be reflected there.
 */
export function setupOAuthMetadataRoutes({ app }: { app: Express }) {
  // OAuth Protected Resource Metadata (RFC 9728)
  // MCP clients discover the authorization server via this endpoint.
  // Claude.ai fetches the path-aware form first, then falls back to root.
  const protectedResourceHandler = (_req: Request, res: Response) => {
    res.json({
      resource: `${MCP_BASE_URL}/mcp`,
      authorization_servers: [MCP_BASE_URL],
      scopes_supported: MCP_SCOPES_SUPPORTED,
      bearer_methods_supported: ['header'],
    });
  };

  // Path-aware form (RFC 9728 Section 3.1) — Claude.ai tries this first
  app.get('/.well-known/oauth-protected-resource/mcp', protectedResourceHandler);
  // Root form — fallback
  app.get('/.well-known/oauth-protected-resource', protectedResourceHandler);

  // OAuth Authorization Server Metadata (RFC 8414)
  // MCP clients discover OAuth endpoints via /.well-known/oauth-authorization-server
  // Path-aware form (RFC 8414 Section 3.1) — MCP Inspector tries this first
  // Root form — fallback for clients that don't use path-aware discovery
  const asMetadataHandler = (_req: Request, res: Response) => {
    const authPath = `${MCP_BASE_URL}${API_PREFIX}/auth`;

    res.json({
      issuer: MCP_BASE_URL,
      authorization_endpoint: `${authPath}/oauth2/authorize`,
      token_endpoint: `${authPath}/oauth2/token`,
      registration_endpoint: `${authPath}/oauth2/register`,
      revocation_endpoint: `${authPath}/oauth2/revoke`,
      introspection_endpoint: `${authPath}/oauth2/introspect`,
      jwks_uri: `${authPath}/.well-known/jwks.json`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: MCP_SCOPES_SUPPORTED,
    });
  };

  app.get('/.well-known/oauth-authorization-server/mcp', asMetadataHandler);
  app.get('/.well-known/oauth-authorization-server', asMetadataHandler);

  // Claude.ai workaround: it ignores authorization_endpoint/token_endpoint from the
  // AS metadata and hardcodes /authorize, /token, /register on the base URL.
  // 307 redirects preserve the HTTP method (POST stays POST).
  // See: https://github.com/anthropics/claude-ai-mcp/issues/82
  const oauthProxyPaths: Record<string, string> = {
    '/authorize': `${API_PREFIX}/auth/oauth2/authorize`,
    '/token': `${API_PREFIX}/auth/oauth2/token`,
    '/register': `${API_PREFIX}/auth/oauth2/register`,
  };

  for (const [shortPath, fullPath] of Object.entries(oauthProxyPaths)) {
    app.all(shortPath, (req, res) => {
      const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
      res.redirect(307, `${fullPath}${qs}`);
    });
  }
}
