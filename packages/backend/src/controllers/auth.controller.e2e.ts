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
    it('should route sign-up endpoint correctly and return 404 for unknown auth paths', async () => {
      const signUpRes = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: {
          email: 'test@test.local',
          password: 'password123',
          name: 'Test User',
        },
      });

      // Mock returns 200 with user data
      expect(signUpRes.statusCode).toEqual(200);
      expect(signUpRes.body.user).toBeDefined();

      const unknownRes = await makeAuthRequest({
        method: 'get',
        url: '/auth/unknown-endpoint',
      });

      expect(unknownRes.statusCode).toEqual(404);
    });
  });

  describe('Session Middleware', () => {
    it('should return session data matching the cookie header (absent, empty, valid)', async () => {
      const noHeaderRes = await makeAuthRequest({
        method: 'get',
        url: '/auth/get-session',
      });

      expect(noHeaderRes.statusCode).toEqual(200);

      const emptyCookieRes = await makeAuthRequest({
        method: 'get',
        url: '/auth/get-session',
        headers: { Cookie: '' },
      });

      expect(emptyCookieRes.statusCode).toEqual(200);
      expect(emptyCookieRes.body.session).toBeNull();

      const validCookieRes = await makeAuthRequest({
        method: 'get',
        url: '/auth/get-session',
        headers: { Cookie: 'bt_auth.session_token=test-token' },
      });

      expect(validCookieRes.statusCode).toEqual(200);
      expect(validCookieRes.body.user).toBeDefined();
      expect(validCookieRes.body.session).toBeDefined();
    });
  });

  describe('Protected Routes', () => {
    it('should reject unauthenticated requests and return user data for authenticated ones', async () => {
      const originalCookies = global.APP_AUTH_COOKIES;
      global.APP_AUTH_COOKIES = null;

      try {
        const res = await makeRequest({
          method: 'get',
          url: '/user',
        });

        expect(res.statusCode).toEqual(401);
      } finally {
        global.APP_AUTH_COOKIES = originalCookies;
      }

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
      expect(res.body.user).toBeDefined();
      expect(res.body.session).toBeDefined();

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
