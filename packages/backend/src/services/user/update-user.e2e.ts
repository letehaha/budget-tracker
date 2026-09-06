import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import Users from '@models/users.model';
import { makeRequest } from '@tests/helpers/common';

/**
 * Integration tests for PUT /user/update — focused on the username field.
 *
 * Covers the contract introduced alongside slugify-on-signup:
 *   - Slug-shape validation (mirrors slugifyUsername output)
 *   - Length cap (1-64) and trimming
 *   - Friendly 422 on collision instead of bubbling the raw
 *     UniqueConstraintError as a 5xx
 *
 * The default test user is seeded as username='test1' (see setupIntegrationTests).
 */
describe('PUT /user/update — username', () => {
  it('accepts the current name, a new slug, padded input, and leaves username alone when omitted', async () => {
    const noOp = await makeRequest({
      method: 'put',
      url: '/user/update',
      payload: { username: 'test1' },
    });
    expect(noOp.statusCode).toEqual(200);
    expect(noOp.body.response.username).toEqual('test1');

    const renamed = await makeRequest({
      method: 'put',
      url: '/user/update',
      payload: { username: 'wendy-marlow' },
    });
    expect(renamed.statusCode).toEqual(200);
    const updated = await Users.findOne({ where: { id: renamed.body.response.id }, raw: true });
    expect(updated!.username).toEqual('wendy-marlow');

    const padded = await makeRequest({
      method: 'put',
      url: '/user/update',
      payload: { username: '  felix-ironwood  ' },
    });
    expect(padded.statusCode).toEqual(200);
    expect(padded.body.response.username).toEqual('felix-ironwood');

    const otherField = await makeRequest({
      method: 'put',
      url: '/user/update',
      payload: { firstName: 'Wendy' },
    });
    expect(otherField.statusCode).toEqual(200);
    expect(otherField.body.response.firstName).toEqual('Wendy');
    expect(otherField.body.response.username).toEqual('felix-ironwood');
  }, 30_000);

  describe('format rejection (422)', () => {
    it('rejects every malformed username shape', async () => {
      const rejected: [string, string][] = [
        ['empty after trim', '   '],
        ['uppercase letters', 'WendyMarlow'],
        ['underscore', 'wendy_marlow'],
        ['leading hyphen', '-wendy'],
        ['trailing hyphen', 'wendy-'],
        ['consecutive hyphens', 'wendy--marlow'],
        ['non-ASCII', 'wendy•marlow'],
        ['whitespace inside', 'wendy marlow'],
        ['longer than 64 characters', 'a'.repeat(65)],
      ];

      for (const [label, username] of rejected) {
        const res = await makeRequest({
          method: 'put',
          url: '/user/update',
          payload: { username },
        });

        expect([label, res.statusCode]).toEqual([label, 422]);
      }

      const unchanged = await Users.findOne({ where: { username: 'test1' }, raw: true });
      expect(unchanged).not.toBeNull();
    }, 30_000);

    it('accepts a 64-character slug at the limit', async () => {
      const atLimit = 'a'.repeat(64);
      const res = await makeRequest({
        method: 'put',
        url: '/user/update',
        payload: { username: atLimit },
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body.response.username).toEqual(atLimit);
    });
  });

  describe('uniqueness collision', () => {
    it('returns 422 with a friendly message instead of a 500 when the username is taken', async () => {
      // Seed a second user so there is something to collide with.
      const otherUsername = 'quentin-blackwood';
      await Users.create({ username: otherUsername, authUserId: 'other-auth-user-id' });

      const res = await makeRequest({
        method: 'put',
        url: '/user/update',
        payload: { username: otherUsername },
      });

      expect(res.statusCode).toEqual(422);
      expect(res.body.response.message).toMatch(/already taken/i);
      expect(res.body.response.message).toContain(otherUsername);

      const stillTest1 = await Users.findOne({ where: { username: 'test1' }, raw: true });
      expect(stillTest1).not.toBeNull();
    });
  });

  describe('reserved admin usernames', () => {
    let originalAdminUsers: string | undefined;

    beforeEach(() => {
      originalAdminUsers = process.env.ADMIN_USERS;
    });

    afterEach(() => {
      if (originalAdminUsers !== undefined) {
        process.env.ADMIN_USERS = originalAdminUsers;
      } else {
        delete process.env.ADMIN_USERS;
      }
    });

    it('rejects claiming a configured ADMIN_USERS name (privilege escalation)', async () => {
      process.env.ADMIN_USERS = 'reserved-admin';

      const res = await makeRequest({
        method: 'put',
        url: '/user/update',
        payload: { username: 'reserved-admin' },
      });

      expect(res.statusCode).toEqual(422);

      const stillTest1 = await Users.findOne({ where: { username: 'test1' }, raw: true });
      expect(stillTest1).not.toBeNull();
      const claimed = await Users.findOne({ where: { username: 'reserved-admin' }, raw: true });
      expect(claimed).toBeNull();

      // The reservation must survive adminOnly's normalization: padded entries and
      // multi-value ADMIN_USERS still block the claim.
      process.env.ADMIN_USERS = '  reserved-admin  , other-admin';

      const padded = await makeRequest({
        method: 'put',
        url: '/user/update',
        payload: { username: 'reserved-admin' },
      });

      expect(padded.statusCode).toEqual(422);
    });

    it('still allows renaming to a non-admin username while ADMIN_USERS is set', async () => {
      process.env.ADMIN_USERS = 'reserved-admin';

      const res = await makeRequest({
        method: 'put',
        url: '/user/update',
        payload: { username: 'harriet-vane' },
      });

      expect(res.statusCode).toEqual(200);
      expect(res.body.response.username).toEqual('harriet-vane');
    });
  });
});
