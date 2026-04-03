import { API_RESPONSE_STATUS } from '@bt/shared/types/api';
import { afterEach, describe, expect, it } from '@jest/globals';
import { app } from '@root/app';
import { CustomResponse } from '@tests/helpers';
import * as mcpHelpers from '@tests/helpers/mcp';
import request from 'supertest';

describe('MCP Connected Apps API', () => {
  afterEach(async () => {
    await mcpHelpers.cleanupTestOAuthData();
  });

  describe('GET /user/settings/mcp/connected-apps', () => {
    it('returns empty array when no apps are connected', async () => {
      const apps = await mcpHelpers.getConnectedApps({ raw: true });

      expect(apps).toEqual([]);
    });

    it('returns 401 when not authenticated', async () => {
      const savedCookies = global.APP_AUTH_COOKIES;
      global.APP_AUTH_COOKIES = '';

      const res: CustomResponse<unknown> = await mcpHelpers.getConnectedApps({ raw: false });

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe(API_RESPONSE_STATUS.error);

      global.APP_AUTH_COOKIES = savedCookies;
    });

    it('returns connected app with correct fields when OAuth data exists', async () => {
      const client = await mcpHelpers.createTestOAuthClient();
      await mcpHelpers.createTestOAuthConsent({ clientId: client.clientId });
      await mcpHelpers.createTestOAuthAccessToken({ clientId: client.id });

      const apps = await mcpHelpers.getConnectedApps({ raw: true });

      expect(apps).toHaveLength(1);
      expect(apps[0]).toMatchObject({
        clientId: client.clientId,
        name: client.name,
        scopes: expect.arrayContaining(['finance:read', 'profile:read']),
        connectedAt: expect.any(String),
        lastUsedAt: expect.any(String),
      });
    });

    it('returns connected app with lastUsedAt as null when no access tokens exist', async () => {
      const client = await mcpHelpers.createTestOAuthClient();
      await mcpHelpers.createTestOAuthConsent({ clientId: client.clientId });

      const apps = await mcpHelpers.getConnectedApps({ raw: true });

      expect(apps).toHaveLength(1);
      expect(apps[0]!.lastUsedAt).toBeNull();
    });
  });

  describe('DELETE /user/settings/mcp/connected-apps/:clientId', () => {
    it('returns error for non-existent client', async () => {
      const res: CustomResponse<unknown> = await mcpHelpers.revokeConnectedApp({
        clientId: 'non-existent-client-id',
        raw: false,
      });

      expect(res.statusCode).toBe(404);
      expect(res.body.status).toBe(API_RESPONSE_STATUS.error);
    });

    it('returns 401 when not authenticated', async () => {
      const savedCookies = global.APP_AUTH_COOKIES;
      global.APP_AUTH_COOKIES = '';

      const res: CustomResponse<unknown> = await mcpHelpers.revokeConnectedApp({
        clientId: 'some-client',
        raw: false,
      });

      expect(res.statusCode).toBe(401);
      expect(res.body.status).toBe(API_RESPONSE_STATUS.error);

      global.APP_AUTH_COOKIES = savedCookies;
    });

    it('successfully revokes a connected app and removes it from the list', async () => {
      const client = await mcpHelpers.createTestOAuthClient();
      await mcpHelpers.createTestOAuthConsent({ clientId: client.clientId });
      await mcpHelpers.createTestOAuthAccessToken({ clientId: client.id });

      // Verify the app exists before revoking
      const appsBefore = await mcpHelpers.getConnectedApps({ raw: true });
      expect(appsBefore).toHaveLength(1);

      // Revoke the app
      const res: CustomResponse<{ success: boolean }> = await mcpHelpers.revokeConnectedApp({
        clientId: client.clientId,
        raw: false,
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.response).toEqual({ success: true });

      // Verify the app is no longer in the list
      const appsAfter = await mcpHelpers.getConnectedApps({ raw: true });
      expect(appsAfter).toEqual([]);
    });

    it('removes access tokens and consent records from the auth DB', async () => {
      const client = await mcpHelpers.createTestOAuthClient();
      await mcpHelpers.createTestOAuthConsent({ clientId: client.clientId });
      await mcpHelpers.createTestOAuthAccessToken({ clientId: client.id });

      // Verify records exist before revoking
      const countsBefore = await mcpHelpers.getTestOAuthRecordCounts({
        internalClientId: client.id,
      });
      expect(countsBefore.accessTokens).toBe(1);
      expect(countsBefore.consents).toBe(1);

      // Revoke the app
      await mcpHelpers.revokeConnectedApp({
        clientId: client.clientId,
        raw: true,
      });

      // Verify records were deleted from the auth DB
      const countsAfter = await mcpHelpers.getTestOAuthRecordCounts({
        internalClientId: client.id,
      });
      expect(countsAfter.accessTokens).toBe(0);
      expect(countsAfter.consents).toBe(0);
    });
  });
});

describe('OAuth Discovery Endpoints', () => {
  describe('GET /.well-known/oauth-authorization-server', () => {
    it('returns valid OAuth authorization server metadata', async () => {
      const res = await request(app).get('/.well-known/oauth-authorization-server');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        issuer: expect.any(String),
        authorization_endpoint: expect.stringContaining('/oauth2/authorize'),
        token_endpoint: expect.stringContaining('/oauth2/token'),
        registration_endpoint: expect.stringContaining('/oauth2/register'),
        revocation_endpoint: expect.stringContaining('/oauth2/revoke'),
        response_types_supported: ['code'],
        grant_types_supported: expect.arrayContaining(['authorization_code', 'refresh_token']),
        code_challenge_methods_supported: ['S256'],
        scopes_supported: expect.arrayContaining(['finance:read', 'profile:read']),
      });
    });

    it('returns token_endpoint_auth_methods_supported', async () => {
      const res = await request(app).get('/.well-known/oauth-authorization-server');

      expect(res.body.token_endpoint_auth_methods_supported).toEqual(
        expect.arrayContaining(['client_secret_basic', 'none']),
      );
    });

    it('returns same metadata from path-aware form', async () => {
      const res = await request(app).get('/.well-known/oauth-authorization-server/api/v1/mcp');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        issuer: expect.any(String),
        authorization_endpoint: expect.stringContaining('/oauth2/authorize'),
        token_endpoint: expect.stringContaining('/oauth2/token'),
        registration_endpoint: expect.stringContaining('/oauth2/register'),
        revocation_endpoint: expect.stringContaining('/oauth2/revoke'),
        response_types_supported: ['code'],
        grant_types_supported: expect.arrayContaining(['authorization_code', 'refresh_token']),
        code_challenge_methods_supported: ['S256'],
        scopes_supported: expect.arrayContaining(['finance:read', 'profile:read']),
      });
    });
  });

  describe('GET /.well-known/oauth-protected-resource', () => {
    it('returns valid OAuth protected resource metadata from root form', async () => {
      const res = await request(app).get('/.well-known/oauth-protected-resource');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        resource: expect.stringContaining('/api/v1/mcp'),
        authorization_servers: expect.any(Array),
        scopes_supported: expect.arrayContaining(['finance:read', 'profile:read', 'offline_access']),
        bearer_methods_supported: ['header'],
      });
      expect(res.body.authorization_servers).toHaveLength(1);
    });

    it('returns valid OAuth protected resource metadata from path-aware form', async () => {
      const res = await request(app).get('/.well-known/oauth-protected-resource/api/v1/mcp');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        resource: expect.stringContaining('/api/v1/mcp'),
        authorization_servers: expect.any(Array),
        scopes_supported: expect.arrayContaining(['finance:read', 'profile:read', 'offline_access']),
        bearer_methods_supported: ['header'],
      });
      expect(res.body.authorization_servers).toHaveLength(1);
    });
  });
});
