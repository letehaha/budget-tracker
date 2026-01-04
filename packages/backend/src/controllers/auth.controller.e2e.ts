import { describe, expect, it } from '@jest/globals';
import { makeAuthRequest, makeRequest } from '@tests/helpers';

/**
 * Auth Integration Tests
 *
 * These tests verify that:
 * 1. Auth endpoints are correctly routed
 * 2. Session middleware correctly protects routes
 * 3. Cookie-based authentication flow works
 *
 * Note: better-auth is mocked due to ESM compatibility issues with Jest.
 * The mock provides basic auth flow simulation. For full auth testing,
 * manual testing or a different test runner (Vitest) would be needed.
 */
describe('Auth Integration', () => {
  describe('Auth Endpoints Routing', () => {
    it('should route sign-up endpoint correctly', async () => {
      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: {
          email: 'test@test.local',
          password: 'password123',
          name: 'Test User',
        },
      });

      // Mock returns 200 with user data
      expect(res.statusCode).toEqual(200);
      expect(res.body.user).toBeDefined();
    });

    it('should route sign-in endpoint correctly', async () => {
      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-in/email',
        payload: {
          email: 'test@test.local',
          password: 'password123',
        },
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.session).toBeDefined();
    });

    it('should route get-session endpoint correctly', async () => {
      const res = await makeAuthRequest({
        method: 'get',
        url: '/auth/get-session',
      });

      // Without cookies, should return null session
      expect(res.statusCode).toEqual(200);
    });

    it('should route sign-out endpoint correctly', async () => {
      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-out',
        headers: { Cookie: 'bt_auth.session_token=test-token' },
      });

      expect(res.statusCode).toEqual(200);
    });

    it('should return 404 for unknown auth paths', async () => {
      const res = await makeAuthRequest({
        method: 'get',
        url: '/auth/unknown-endpoint',
      });

      expect(res.statusCode).toEqual(404);
    });
  });

  describe('Session Middleware', () => {
    it('should return session data when valid cookie is present', async () => {
      const res = await makeAuthRequest({
        method: 'get',
        url: '/auth/get-session',
        headers: { Cookie: 'bt_auth.session_token=test-token' },
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.session).toBeDefined();
    });

    it('should return null session when no cookie is present', async () => {
      const res = await makeAuthRequest({
        method: 'get',
        url: '/auth/get-session',
        headers: { Cookie: '' },
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body.session).toBeNull();
    });
  });

  describe('Protected Routes', () => {
    it('should reject unauthenticated requests to protected endpoints', async () => {
      // Clear the global auth cookies to simulate unauthenticated request
      const originalCookies = global.APP_AUTH_COOKIES;
      global.APP_AUTH_COOKIES = null;

      try {
        const res = await makeRequest({
          method: 'get',
          url: '/user',
        });

        expect(res.statusCode).toEqual(401);
      } finally {
        // Restore cookies
        global.APP_AUTH_COOKIES = originalCookies;
      }
    });

    it('should allow authenticated requests to protected endpoints', async () => {
      // This uses the global auth cookies set up in beforeEach
      const res = await makeRequest({
        method: 'get',
        url: '/user',
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body.response).toBeDefined();
    });

    it('should return user data for authenticated requests', async () => {
      const res = await makeRequest({
        method: 'get',
        url: '/user',
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body.response.id).toBeDefined();
      expect(res.body.response.username).toBeDefined();
    });
  });

  describe('Cookie Handling', () => {
    it('should set session cookie on sign-in', async () => {
      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-in/email',
        payload: {
          email: 'cookie.test@test.local',
          password: 'password123',
        },
      });

      expect(res.statusCode).toEqual(200);

      // Check for Set-Cookie header
      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      expect(Array.isArray(setCookie) ? setCookie.join('') : setCookie).toContain('bt_auth');
    });

    it('should clear session cookie on sign-out', async () => {
      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-out',
        headers: { Cookie: 'bt_auth.session_token=test-token' },
      });

      expect(res.statusCode).toEqual(200);

      // Check that cookie is cleared (expires in the past)
      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      const cookieStr = Array.isArray(setCookie) ? setCookie.join('') : setCookie;
      expect(cookieStr).toContain('Expires=');
    });
  });
});
