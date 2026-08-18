import { afterEach, describe, expect, it } from '@jest/globals';
import { makeAuthRequest, makeRequest } from '@tests/helpers';

/** Suite setup inserts one ba_user, so a cap of 1 means the instance is already full. */
describe('Signup cap (SYSTEM_MAX_SIGNUPS_ALLOWED)', () => {
  afterEach(() => {
    delete process.env.SYSTEM_MAX_SIGNUPS_ALLOWED;
  });

  const trySignup = () =>
    makeAuthRequest({
      method: 'post',
      url: '/auth/sign-up/email',
      payload: {
        email: `cap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
        password: 'testpassword123',
        name: 'Cap Test',
      },
    });

  it('unset: signups open and signup succeeds', async () => {
    const status = await makeRequest({ method: 'get', url: '/auth/signups-open', raw: true });
    expect(status).toEqual({ signupsOpen: true });

    const res = await trySignup();
    expect(res.statusCode).toBe(200);
  });

  it('at the limit: signups closed and signup rejected', async () => {
    process.env.SYSTEM_MAX_SIGNUPS_ALLOWED = '1';

    const status = await makeRequest({ method: 'get', url: '/auth/signups-open', raw: true });
    expect(status).toEqual({ signupsOpen: false });

    const res = await trySignup();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('SIGNUPS_DISABLED');
  });

  it('under the limit: signup succeeds and closes once the slot is taken', async () => {
    process.env.SYSTEM_MAX_SIGNUPS_ALLOWED = '2';

    const res = await trySignup();
    expect(res.statusCode).toBe(200);

    const status = await makeRequest({ method: 'get', url: '/auth/signups-open', raw: true });
    expect(status).toEqual({ signupsOpen: false });
  });
});
