import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { connection } from '@models/index';
import Tags from '@models/tags.model';
import Users from '@models/users.model';
import * as userService from '@services/user.service';
import { makeAuthRequest } from '@tests/helpers';

/**
 * Signup-flow integration tests.
 *
 * Covers the after-hook contract end-to-end (better-auth → app `Users`):
 *   - Username slugification + collision retry
 *   - Full-name parsing into firstName / middleName / lastName
 *   - Stage-1 (app-user creation) failure → rollback orphan ba_user, propagate error
 *   - Stage-2 (default seeding) failure → keep usable account, return 200
 *
 * Note: better-auth is mocked due to ESM compatibility issues with Jest;
 * the mock now persists `ba_user` rows so rollback paths are exercised.
 */
describe('Signup flow', () => {
  describe('Username uniqueness', () => {
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
      expect(newAppUser!.username).not.toEqual('test1');
      expect(newAppUser!.username).toMatch(/^test1-[0-9a-f]{8}$/);

      const originalUser = await Users.findOne({ where: { username: 'test1' }, raw: true });
      expect(originalUser).not.toBeNull();
      expect(originalUser!.authUserId).toEqual('test-user-id');
    });

    it('should produce distinct usernames across multiple consecutive collisions', async () => {
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

      const unique = new Set([...usernames, baseName]);
      expect(unique.size).toEqual(4);
      usernames.forEach((u) => expect(u).toMatch(/^test1-[0-9a-f]{8}$/));
    });

    it('should fall back to email prefix for username AND leave name fields null when name is empty', async () => {
      // The hook fallback chain for username is: user.name || user.email.split('@')[0] || 'user'.
      // An empty `name` must trigger the email-prefix branch for the username,
      // BUT must not be passed to fullName parsing — email-prefix fallbacks
      // aren't real names and shouldn't pollute firstName/middleName/lastName.
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
      const appUser = await Users.findOne({ where: { authUserId: res.body.user.id }, raw: true });
      expect(appUser).not.toBeNull();
      expect(appUser!.username).toMatch(/^fallback-user(-[0-9a-f]{8})?$/);
      expect(appUser!.firstName).toBeNull();
      expect(appUser!.middleName).toBeNull();
      expect(appUser!.lastName).toBeNull();
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
  });

  describe('Slugify on signup', () => {
    it('should slugify the input name (lowercase + hyphenated) before storing', async () => {
      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: {
          email: 'slug-mixed@test.local',
          password: 'password123',
          name: 'John Doe Smith',
        },
      });
      expect(res.statusCode).toEqual(200);

      const appUser = await Users.findOne({ where: { authUserId: res.body.user.id }, raw: true });
      expect(appUser).not.toBeNull();
      expect(appUser!.username).toEqual('john-doe-smith');
    });

    it('should slugify uppercase input to all-lowercase', async () => {
      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: {
          email: 'slug-upper@test.local',
          password: 'password123',
          name: 'JOHN',
        },
      });
      expect(res.statusCode).toEqual(200);

      const appUser = await Users.findOne({ where: { authUserId: res.body.user.id }, raw: true });
      expect(appUser!.username).toEqual('john');
    });

    it('should strip special characters and trailing whitespace from the name', async () => {
      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: {
          email: 'slug-special@test.local',
          password: 'password123',
          name: '  Foo. Bar!  ',
        },
      });
      expect(res.statusCode).toEqual(200);

      const appUser = await Users.findOne({ where: { authUserId: res.body.user.id }, raw: true });
      expect(appUser!.username).toEqual('foo-bar');
    });

    it('should produce a case-insensitive collision when "John" and "john" both sign up', async () => {
      // Both names slugify to "john" — first wins, second gets the suffix.
      const first = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: { email: 'case-1@test.local', password: 'password123', name: 'John' },
      });
      expect(first.statusCode).toEqual(200);

      const second = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: { email: 'case-2@test.local', password: 'password123', name: 'john' },
      });
      expect(second.statusCode).toEqual(200);

      const firstAppUser = await Users.findOne({ where: { authUserId: first.body.user.id }, raw: true });
      const secondAppUser = await Users.findOne({ where: { authUserId: second.body.user.id }, raw: true });

      expect(firstAppUser!.username).toEqual('john');
      expect(secondAppUser!.username).toMatch(/^john-[0-9a-f]{8}$/);
    });

    it('should fall back to "user" when the name slugifies to empty (e.g., emoji-only)', async () => {
      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: {
          email: 'slug-emoji@test.local',
          password: 'password123',
          name: '🎉🚀',
        },
      });
      expect(res.statusCode).toEqual(200);

      const appUser = await Users.findOne({ where: { authUserId: res.body.user.id }, raw: true });
      expect(appUser).not.toBeNull();
      // First user with all-non-Latin name claims literal "user", subsequent
      // ones get the suffix retry. Either is acceptable here.
      expect(appUser!.username).toMatch(/^user(-[0-9a-f]{8})?$/);
    });

    it('should cap an extremely long name at the slug length limit', async () => {
      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: {
          email: 'slug-long@test.local',
          password: 'password123',
          name: 'a'.repeat(300),
        },
      });
      expect(res.statusCode).toEqual(200);

      const appUser = await Users.findOne({ where: { authUserId: res.body.user.id }, raw: true });
      expect(appUser).not.toBeNull();
      expect(appUser!.username.length).toBeLessThanOrEqual(64);
    });
  });

  describe('Name parsing on signup', () => {
    it('should parse a two-token name into firstName + lastName', async () => {
      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: {
          email: 'parse-two@test.local',
          password: 'password123',
          name: 'Wendy Marlow',
        },
      });
      expect(res.statusCode).toEqual(200);

      const appUser = await Users.findOne({ where: { authUserId: res.body.user.id }, raw: true });
      expect(appUser!.username).toEqual('wendy-marlow');
      expect(appUser!.firstName).toEqual('Wendy');
      expect(appUser!.lastName).toEqual('Marlow');
      expect(appUser!.middleName).toBeNull();
    });

    it('should parse a three-token name into firstName + middleName + lastName', async () => {
      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: {
          email: 'parse-three@test.local',
          password: 'password123',
          name: 'Caspian Reed Holloway',
        },
      });
      expect(res.statusCode).toEqual(200);

      const appUser = await Users.findOne({ where: { authUserId: res.body.user.id }, raw: true });
      expect(appUser!.firstName).toEqual('Caspian');
      expect(appUser!.middleName).toEqual('Reed');
      expect(appUser!.lastName).toEqual('Holloway');
    });

    it('should put a single-token name into firstName only', async () => {
      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: {
          email: 'parse-single@test.local',
          password: 'password123',
          name: 'Marigold',
        },
      });
      expect(res.statusCode).toEqual(200);

      const appUser = await Users.findOne({ where: { authUserId: res.body.user.id }, raw: true });
      expect(appUser!.firstName).toEqual('Marigold');
      expect(appUser!.lastName).toBeNull();
      expect(appUser!.middleName).toBeNull();
    });

    it('should preserve original casing in firstName/lastName even when slugifying username', async () => {
      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: {
          email: 'parse-case@test.local',
          password: 'password123',
          name: 'Quentin Blackwood',
        },
      });
      expect(res.statusCode).toEqual(200);

      const appUser = await Users.findOne({ where: { authUserId: res.body.user.id }, raw: true });
      expect(appUser!.username).toEqual('quentin-blackwood');
      expect(appUser!.firstName).toEqual('Quentin');
      expect(appUser!.lastName).toEqual('Blackwood');
    });
  });

  describe('Stage-1: app-user creation failure (rollback)', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should rollback ba_user when app-user creation fails so signup can be retried', async () => {
      // Better-auth commits ba_user BEFORE firing the after-hook. If app-user
      // creation fails, the auth account is already committed but there's no
      // matching app user — the user can't retry signup (email taken) and
      // can't use the app (no app user → 401 "User not found"). Permanent
      // lockout.
      //
      // Fix: on app-user-creation failure, delete the orphaned ba_user
      // (which cascades to ba_account/ba_session) and propagate the error.
      // The user sees a 5xx, the email is freed, and they can retry.
      //
      // To simulate failure deterministically (since slugify now caps the
      // input length and the DB rejects nothing for normal inputs), we spy
      // on userService.createUser and force it to reject.
      const spy = jest
        .spyOn(userService, 'createUser')
        .mockRejectedValue(new Error('forced failure for rollback test'));

      const email = 'rollback-target@test.local';

      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: {
          email,
          password: 'password123',
          name: 'rollback-target',
        },
      });

      expect(res.statusCode).not.toEqual(200);
      expect(spy).toHaveBeenCalled();

      const [orphans] = (await connection.sequelize.query(`SELECT id FROM ba_user WHERE email = :email`, {
        replacements: { email },
      })) as [Array<{ id: string }>, unknown];
      expect(orphans).toHaveLength(0);

      const appUsers = await Users.findAll({ where: { email }, raw: true });
      expect(appUsers).toHaveLength(0);
    });
  });

  describe('Stage-2: seeding failure (keep usable account)', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should still return 200 and keep the app user', async () => {
      // Stage-2 contract: once the app user row exists, the user can sign
      // in and use the app even if categories/tags seeding fails. Locking
      // them out for a best-effort seeding failure would be worse than
      // the partial state.
      // Spy on the underlying model's bulkCreate (the barrel export at
      // `@services/tags` produces non-configurable namespace properties
      // that jest.spyOn can't replace).
      const spy = jest.spyOn(Tags, 'bulkCreate').mockRejectedValue(new Error('forced seed failure for test'));

      const res = await makeAuthRequest({
        method: 'post',
        url: '/auth/sign-up/email',
        payload: {
          email: 'partial-seed@test.local',
          password: 'password123',
          name: 'partial-seed-user',
        },
      });

      expect(res.statusCode).toEqual(200);
      expect(spy).toHaveBeenCalled();

      const appUser = await Users.findOne({ where: { authUserId: res.body.user.id }, raw: true });
      expect(appUser).not.toBeNull();
    });
  });
});
