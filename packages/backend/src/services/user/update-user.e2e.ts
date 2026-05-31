import type { RecordId } from '@bt/shared/types';
import Users from '@models/users.model';
import { makeRequest } from '@tests/helpers/common';
import { describe, expect, it } from 'vitest';

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
  it('updates to a valid slug', async () => {
    const res = await makeRequest({
      method: 'put',
      url: '/user/update',
      payload: { username: 'wendy-marlow' },
    });

    expect(res.statusCode).toEqual(200);

    const updated = await Users.findOne({ where: { id: res.body.response.id }, raw: true });
    expect(updated!.username).toEqual('wendy-marlow');
  });

  it("accepts updating to the user's own current username (no-op)", async () => {
    const res = await makeRequest({
      method: 'put',
      url: '/user/update',
      payload: { username: 'test1' },
    });

    expect(res.statusCode).toEqual(200);
    expect(res.body.response.username).toEqual('test1');
  });

  it('trims surrounding whitespace before validating', async () => {
    const res = await makeRequest({
      method: 'put',
      url: '/user/update',
      payload: { username: '  felix-ironwood  ' },
    });

    expect(res.statusCode).toEqual(200);
    expect(res.body.response.username).toEqual('felix-ironwood');
  });

  it('allows updating other fields without a username (no validation triggered)', async () => {
    const res = await makeRequest({
      method: 'put',
      url: '/user/update',
      payload: { firstName: 'Wendy' },
    });

    expect(res.statusCode).toEqual(200);
    expect(res.body.response.firstName).toEqual('Wendy');
    expect(res.body.response.username).toEqual('test1');
  });

  describe('format rejection (422)', () => {
    it.each([
      ['empty after trim', '   '],
      ['uppercase letters', 'WendyMarlow'],
      ['underscore', 'wendy_marlow'],
      ['leading hyphen', '-wendy'],
      ['trailing hyphen', 'wendy-'],
      ['consecutive hyphens', 'wendy--marlow'],
      ['non-ASCII', 'wendy•marlow'],
      ['whitespace inside', 'wendy marlow'],
    ])('rejects %s', async (_label, username) => {
      const res = await makeRequest({
        method: 'put',
        url: '/user/update',
        payload: { username },
      });

      expect(res.statusCode).toEqual(422);

      const unchanged = await Users.findOne({ where: { username: 'test1' }, raw: true });
      expect(unchanged).not.toBeNull();
    });

    it('rejects usernames longer than 64 characters', async () => {
      const tooLong = 'a'.repeat(65);
      const res = await makeRequest({
        method: 'put',
        url: '/user/update',
        payload: { username: tooLong },
      });

      expect(res.statusCode).toEqual(422);
    });

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
      await Users.create({ username: otherUsername, authUserId: 'other-auth-user-id' as RecordId });

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
});
