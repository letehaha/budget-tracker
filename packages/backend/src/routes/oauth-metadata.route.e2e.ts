import { describe, expect, it } from '@jest/globals';
import { app } from '@root/app';
import request from 'supertest';

// The AS issuer must equal the RFC 9207 `iss` better-auth stamps on
// authorization responses (baseURL + basePath, and basePath is
// `${API_PREFIX}/auth`). A bare-origin issuer makes RFC 9207-validating clients
// (e.g. the MCP SDK used by Claude Code) reject the callback.
const AUTH_SERVER_METADATA_PATHS = [
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-authorization-server/mcp',
  '/.well-known/oauth-authorization-server/api/v1/auth',
];

const PROTECTED_RESOURCE_METADATA_PATHS = [
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp',
];

describe('OAuth discovery metadata', () => {
  describe.each(AUTH_SERVER_METADATA_PATHS)('GET %s', (path) => {
    it('returns authorization server metadata whose issuer carries the auth basePath', async () => {
      const res = await request(app).get(path);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        response_types_supported: ['code'],
        grant_types_supported: expect.arrayContaining(['authorization_code', 'refresh_token']),
        code_challenge_methods_supported: ['S256'],
        scopes_supported: expect.arrayContaining(['finance:read', 'finance:write', 'finance:delete', 'profile:read']),
      });
      expect(res.body.token_endpoint_auth_methods_supported).toEqual(
        expect.arrayContaining(['client_secret_basic', 'none']),
      );

      // Issuer must end in the better-auth basePath, and every endpoint must sit
      // directly under it — this is what keeps discovery consistent with the
      // `iss` on the authorize redirect.
      expect(res.body.issuer).toMatch(/\/api\/v1\/auth$/);
      expect(res.body.authorization_endpoint).toBe(`${res.body.issuer}/oauth2/authorize`);
      expect(res.body.token_endpoint).toBe(`${res.body.issuer}/oauth2/token`);
      expect(res.body.registration_endpoint).toBe(`${res.body.issuer}/oauth2/register`);
      expect(res.body.revocation_endpoint).toBe(`${res.body.issuer}/oauth2/revoke`);
    });
  });

  it('serves identical authorization server metadata on every form', async () => {
    const bodies = await Promise.all(AUTH_SERVER_METADATA_PATHS.map(async (p) => (await request(app).get(p)).body));
    for (const body of bodies.slice(1)) {
      expect(body).toEqual(bodies[0]);
    }
  });

  describe.each(PROTECTED_RESOURCE_METADATA_PATHS)('GET %s', (path) => {
    it('points authorization_servers at the same issuer the AS metadata advertises', async () => {
      const res = await request(app).get(path);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        resource: expect.stringContaining('/mcp'),
        scopes_supported: expect.arrayContaining(['finance:read', 'profile:read', 'offline_access']),
        bearer_methods_supported: ['header'],
      });
      expect(res.body.authorization_servers).toHaveLength(1);

      const asMetadata = (await request(app).get('/.well-known/oauth-authorization-server')).body;
      expect(res.body.authorization_servers[0]).toBe(asMetadata.issuer);
    });
  });
});
