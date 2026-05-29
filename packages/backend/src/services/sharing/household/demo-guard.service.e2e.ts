import { API_ERROR_CODES, RESOURCE_TYPES, SHARE_PERMISSIONS } from '@bt/shared/types';
import Users from '@models/users.model';
import { extractCookies, makeAuthRequest } from '@tests/helpers';
import {
  acceptShareInvitation,
  asUser,
  backInviteFromShareInvitation,
  cancelShareInvitation,
  createShareInvitation,
  declineShareInvitation,
  leaveShare,
  resendShareInvitation,
  revokeShareMember,
  updateShareMember,
} from '@tests/helpers/share';
import { registerMockSession } from '@tests/mocks/better-auth';
import { describe, expect, it } from 'vitest';

/**
 * Provision a fresh demo user via `POST /demo`, register the session with the better-auth
 * mock, and return the cookies needed by `asUser` for subsequent requests. The caller's
 * existing `APP_AUTH_COOKIES` are restored before returning so the demo identity does not
 * leak to the next `makeRequest` outside an `asUser` block.
 */
const provisionDemoUser = async (): Promise<{ cookies: string; userId: number }> => {
  const savedCookies = global.APP_AUTH_COOKIES;
  global.APP_AUTH_COOKIES = null;
  try {
    const res = await makeAuthRequest({ method: 'post', url: '/demo' });
    if (res.statusCode !== 200) {
      throw new Error(`Failed to create demo user: ${JSON.stringify(res.body)}`);
    }
    const userId = res.body.response.user.id as number;
    const cookies = extractCookies(res);
    const sessionToken = cookies.match(/bt_auth\.session_token=([^;]+)/)?.[1];
    if (!sessionToken) throw new Error('Missing demo session token');
    const dbUser = await Users.findByPk(userId);
    if (!dbUser?.authUserId) throw new Error('Demo user missing authUserId');
    registerMockSession(sessionToken, { id: dbUser.authUserId, email: `demo-${userId}@demo.local` });
    return { cookies, userId };
  } finally {
    global.APP_AUTH_COOKIES = savedCookies;
  }
};

interface GuardedCallResult {
  statusCode: number;
  body: { response: unknown };
}

const expectForbidden = (res: GuardedCallResult) => {
  expect(res.statusCode).toBe(403);
  // Helpers are typed for their success-payload `T`, but on a 403 the body carries the
  // error shape `{ code, message }`. Narrow at the assertion site so the array can stay
  // typed against `CustomResponse<unknown>` without per-call casts.
  const errorBody = res.body.response as { code?: string };
  expect(errorBody.code).toBe(API_ERROR_CODES.forbidden);
};

/**
 * Each entry hits one write endpoint guarded by `blockDemoUsers`. The arguments are
 * intentionally bogus — `blockDemoUsers` runs before payload/data validation, so demo
 * callers get 403 regardless of whether the underlying row exists. That keeps the test
 * focused on the guard itself rather than the downstream service.
 *
 * The call signature uses `unknown` for `body.response` because each helper returns a
 * different success-payload type — widening to `unknown` lets every helper fit without
 * per-call casts, and `expectForbidden` narrows to the error shape at the assertion site.
 */
const guardedCalls: Array<{ name: string; call: () => Promise<GuardedCallResult> }> = [
  {
    name: 'POST /share/invitations',
    call: () =>
      createShareInvitation({
        inviteeEmail: 'someone@test.local',
        resourceType: RESOURCE_TYPES.account,
        resourceId: 1,
        permission: SHARE_PERMISSIONS.read,
      }),
  },
  {
    name: 'POST /share/invitations/:token/accept',
    call: () => acceptShareInvitation({ token: 'demo-blocked-token' }),
  },
  {
    name: 'POST /share/invitations/:token/decline',
    call: () => declineShareInvitation({ token: 'demo-blocked-token' }),
  },
  {
    name: 'POST /share/invitations/:id/resend',
    call: () => resendShareInvitation({ invitationId: 'demo-blocked-id' }),
  },
  {
    name: 'DELETE /share/invitations/:id',
    call: () => cancelShareInvitation({ invitationId: 'demo-blocked-id' }),
  },
  {
    name: 'POST /share/invitations/:id/back-invite',
    call: () =>
      backInviteFromShareInvitation({
        sourceInvitationId: 'demo-blocked-id',
        permission: SHARE_PERMISSIONS.write,
      }),
  },
  {
    name: 'PATCH /share/resources/:type/:id/members/:userId',
    call: () =>
      updateShareMember({
        resourceType: RESOURCE_TYPES.account,
        resourceId: 1,
        memberUserId: 1,
        permission: SHARE_PERMISSIONS.read,
      }),
  },
  {
    name: 'DELETE /share/resources/:type/:id/members/:userId',
    call: () =>
      revokeShareMember({
        resourceType: RESOURCE_TYPES.account,
        resourceId: 1,
        memberUserId: 1,
      }),
  },
  {
    name: 'POST /share/shared-with-me/:type/:id/leave',
    call: () => leaveShare({ resourceType: RESOURCE_TYPES.household, resourceId: 1 }),
  },
];

describe('Demo guards on /share/* write endpoints', () => {
  it.each(guardedCalls)('blocks demo users on $name', async ({ call }) => {
    const demo = await provisionDemoUser();
    const res = await asUser({ cookies: demo.cookies, fn: call });
    expectForbidden(res);
  });

  it('lets non-demo users past the guard (control case)', async () => {
    // The primary test user is a normal user — the guard must not fire. Bogus invitation
    // id keeps us from creating data; we only care that the response is not the demo 403.
    const res = await cancelShareInvitation({ invitationId: 'control-bogus-id' });
    expect(res.statusCode).not.toBe(403);
  });
});
