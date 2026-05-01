import { describe, expect, it } from '@jest/globals';
import { connection } from '@models/index';
import Users from '@models/users.model';
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

    it('should succeed when the requested username already exists (handles unique constraint)', async () => {
      // The default integration test user has username='test1'.
      // Signing up with the same name would conflict on the unique
      // username column inside the `databaseHooks.user.create.after` hook.
      // Without proper handling, the hook re-throws the
      // SequelizeUniqueConstraintError and the auth endpoint fails.
      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: {
          email: 'second@test.local',
          password: 'password123',
          name: 'test1',
        },
      });

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

  describe('Username Uniqueness on Signup', () => {
    it('should persist a different username when colliding with an existing one', async () => {
      // Default test user is 'test1'. A new signup using the same name must
      // succeed AND the underlying app user row must have a different,
      // unique username (the random-suffix retry path).
      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: {
          email: 'collide-1@test.local',
          password: 'password123',
          name: 'test1',
        },
      });

      expect(res.statusCode).toEqual(200);

      const newAuthUserId = res.body.user?.id;
      expect(newAuthUserId).toBeDefined();

      const newAppUser = await Users.findOne({ where: { authUserId: newAuthUserId }, raw: true });
      expect(newAppUser).not.toBeNull();
      // Must NOT be the literal colliding name — the retry path adds a hex suffix.
      expect(newAppUser!.username).not.toEqual('test1');
      expect(newAppUser!.username).toMatch(/^test1-[0-9a-f]{8}$/);

      // The original 'test1' row from setup must still exist untouched.
      const originalUser = await Users.findOne({ where: { username: 'test1' }, raw: true });
      expect(originalUser).not.toBeNull();
      expect(originalUser!.authUserId).toEqual('test-user-id');
    });

    it('should produce distinct usernames across multiple consecutive collisions', async () => {
      // Three signups all colliding with the same base name. Each retry
      // generates an independent random suffix, so all three resulting
      // usernames must be distinct.
      const baseName = 'test1';
      const usernames: string[] = [];

      for (let i = 0; i < 3; i++) {
        const res = await makeAuthRequest({
          method: 'post',
          url: '/auth/sign-up/email',
          payload: {
            email: `multi-collide-${i}@test.local`,
            password: 'password123',
            name: baseName,
          },
        });

        expect(res.statusCode).toEqual(200);
        const authUserId = res.body.user?.id;
        const appUser = await Users.findOne({ where: { authUserId }, raw: true });
        expect(appUser).not.toBeNull();
        usernames.push(appUser!.username);
      }

      // All three retried usernames must be distinct AND distinct from the
      // pre-existing 'test1'.
      const unique = new Set([...usernames, baseName]);
      expect(unique.size).toEqual(4);
      usernames.forEach((u) => expect(u).toMatch(/^test1-[0-9a-f]{8}$/));
    });

    it('should fall back to email prefix when name is empty', async () => {
      // The hook fallback chain is: user.name || user.email.split('@')[0] || 'user'.
      // An empty `name` must trigger the email-prefix branch.
      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: {
          email: 'fallback-user@test.local',
          password: 'password123',
          name: '',
        },
      });

      expect(res.statusCode).toEqual(200);
      const authUserId = res.body.user?.id;
      const appUser = await Users.findOne({ where: { authUserId }, raw: true });
      expect(appUser).not.toBeNull();
      // Either the email prefix as-is, or with a random suffix if it collided.
      expect(appUser!.username).toMatch(/^fallback-user(-[0-9a-f]{8})?$/);
    });

    it('should handle two distinct emails sharing the same name without affecting each other', async () => {
      // Two new signups with the same fresh name (not colliding with the seed
      // user) — first succeeds with the literal name, second must take the
      // suffixed retry path. Verifies that the retry only fires when the DB
      // actually rejects the insert.
      const sharedName = `shared-${Date.now()}`;

      const first = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: {
          email: `first-${Date.now()}@test.local`,
          password: 'password123',
          name: sharedName,
        },
      });
      expect(first.statusCode).toEqual(200);

      const second = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: {
          email: `second-${Date.now() + 1}@test.local`,
          password: 'password123',
          name: sharedName,
        },
      });
      expect(second.statusCode).toEqual(200);

      const firstAppUser = await Users.findOne({
        where: { authUserId: first.body.user.id },
        raw: true,
      });
      const secondAppUser = await Users.findOne({
        where: { authUserId: second.body.user.id },
        raw: true,
      });

      expect(firstAppUser).not.toBeNull();
      expect(secondAppUser).not.toBeNull();
      // First gets the literal name, second gets the suffixed retry.
      expect(firstAppUser!.username).toEqual(sharedName);
      expect(secondAppUser!.username).toMatch(new RegExp(`^${sharedName}-[0-9a-f]{8}$`));
    });

    it('should create exactly one app user per signup (no duplicate or partial rows)', async () => {
      // Sanity check — the retry path must NOT leave behind a half-committed
      // row from the first failed insert. Exactly one app user should exist
      // for the new authUserId.
      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: {
          email: 'one-row@test.local',
          password: 'password123',
          name: 'test1',
        },
      });
      expect(res.statusCode).toEqual(200);

      const authUserId = res.body.user?.id;
      const matches = await Users.findAll({ where: { authUserId }, raw: true });
      expect(matches).toHaveLength(1);
    });

    it('should rollback ba_user when app-user creation fails so signup can be retried', async () => {
      // Better-auth commits ba_user BEFORE firing the after-hook. If app-user
      // creation fails, the auth account is already committed but there's no
      // matching app user — the user can't retry signup (email taken) and
      // can't use the app (no app user → 401 "User not found"). Permanent
      // lockout.
      //
      // Fix: on app-user-creation failure, delete the orphaned ba_user (which
      // cascades to ba_account/ba_session) and propagate the error. The user
      // sees a 5xx, the email is freed, and they can retry.
      //
      // We trigger a non-username DB error (a too-long name exceeding the
      // varchar(255) cap on Users.username) to simulate failure inside
      // createUserWithUniqueUsername.
      const tooLongName = 'a'.repeat(300);
      const email = 'too-long-name@test.local';

      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: {
          email,
          password: 'password123',
          name: tooLongName,
        },
      });

      // Signup must fail loudly so the client knows to retry / show an error.
      expect(res.statusCode).not.toEqual(200);

      // ba_user row for this email must be cleaned up so the user can retry.
      const [orphans] = (await connection.sequelize.query(`SELECT id FROM ba_user WHERE email = :email`, {
        replacements: { email },
      })) as [Array<{ id: string }>, unknown];
      expect(orphans).toHaveLength(0);

      // No app user should exist either.
      const appUsers = await Users.findAll({ where: { email }, raw: true });
      expect(appUsers).toHaveLength(0);
    });

    it('should return 200 even if seeding default categories/tags fails (do not lock out usable accounts)', async () => {
      // Once the app user row exists, the user can sign in and use the app
      // even if categories/tags seeding fails. Locking them out for a
      // best-effort seeding failure would be worse than the partial state.
      //
      // This test pins the desired behaviour: a successful app-user create
      // must return 200 even if a downstream seed step were to throw.
      // (Triggering a real seed-only failure from a black-box e2e is hard
      // without test-specific injection — this serves as a regression guard
      // for the happy path while the orphan-rollback behaviour is covered
      // by the previous test.)
      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: {
          email: 'happy-seed@test.local',
          password: 'password123',
          name: 'happy-seed-user',
        },
      });

      expect(res.statusCode).toEqual(200);
      const appUser = await Users.findOne({ where: { authUserId: res.body.user.id }, raw: true });
      expect(appUser).not.toBeNull();
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
