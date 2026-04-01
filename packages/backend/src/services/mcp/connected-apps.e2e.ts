import { API_RESPONSE_STATUS } from '@bt/shared/types/api';
import { describe, expect, it } from '@jest/globals';
import { app } from '@root/app';
import * as helpers from '@tests/helpers';
import { CustomResponse } from '@tests/helpers';
import request from 'supertest';

describe('MCP Connected Apps API', () => {
  describe('GET /user/settings/mcp/connected-apps', () => {
    it('returns empty array when no apps are connected', async () => {
      const apps = await helpers.getConnectedApps({ raw: true });

      expect(apps).toEqual([]);
    });

    it('returns 401 when not authenticated', async () => {
      const savedCookies = global.APP_AUTH_COOKIES;
      global.APP_AUTH_COOKIES = '';

      const res: CustomResponse<unknown> = await helpers.getConnectedApps({ raw: false });

      expect(res.body.status).toBe(API_RESPONSE_STATUS.error);

      global.APP_AUTH_COOKIES = savedCookies;
    });
  });

  describe('DELETE /user/settings/mcp/connected-apps/:clientId', () => {
    it('returns error for non-existent client', async () => {
      const res: CustomResponse<unknown> = await helpers.revokeConnectedApp({
        clientId: 'non-existent-client-id',
        raw: false,
      });

      expect(res.body.status).toBe(API_RESPONSE_STATUS.error);
    });

    it('returns 401 when not authenticated', async () => {
      const savedCookies = global.APP_AUTH_COOKIES;
      global.APP_AUTH_COOKIES = '';

      const res: CustomResponse<unknown> = await helpers.revokeConnectedApp({
        clientId: 'some-client',
        raw: false,
      });

      expect(res.body.status).toBe(API_RESPONSE_STATUS.error);

      global.APP_AUTH_COOKIES = savedCookies;
    });
  });
});

describe('OAuth Discovery Endpoint', () => {
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
  });
});
