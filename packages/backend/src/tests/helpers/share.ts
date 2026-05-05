import { ResourceType, SharePermission, SharePolicy } from '@bt/shared/types';
import type { acceptInvitation as apiAcceptInvitation } from '@services/sharing/accept-invitation.service';
import type { createInvitation as apiCreateInvitation } from '@services/sharing/create-invitation.service';
import type { declineInvitation as apiDeclineInvitation } from '@services/sharing/decline-invitation.service';
import type {
  listReceivedInvitations as apiListReceivedInvitations,
  listSentInvitations as apiListSentInvitations,
} from '@services/sharing/list-invitations.service';

import { extractCookies, makeAuthRequest, makeRequest } from './common';

export interface SecondUserHandle {
  cookies: string;
  email: string;
}

/**
 * Sign up a fresh user via the better-auth mock. Returns their session cookies plus the
 * email used for sign-up so tests can later look the user up by email. The caller is
 * responsible for swapping `global.APP_AUTH_COOKIES` (use `asUser` below).
 */
export async function signUpSecondUser({
  email,
  name = 'Second User',
}: {
  email?: string;
  name?: string;
} = {}): Promise<SecondUserHandle> {
  const userEmail = email ?? `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const signupRes = await makeAuthRequest({
    method: 'post',
    url: '/auth/sign-up/email',
    payload: {
      email: userEmail,
      password: 'testpassword123',
      name,
    },
  });
  return { cookies: extractCookies(signupRes), email: userEmail };
}

/**
 * Run `fn` while the request cookies belong to the given user. Restores the original
 * cookies (the primary test user) afterwards even if `fn` throws.
 */
export async function asUser<T>({ cookies, fn }: { cookies: string; fn: () => Promise<T> }): Promise<T> {
  const original = global.APP_AUTH_COOKIES;
  global.APP_AUTH_COOKIES = cookies;
  try {
    return await fn();
  } finally {
    global.APP_AUTH_COOKIES = original;
  }
}

/**
 * Set the active user's base currency. Call inside `asUser` when configuring a second
 * user during test setup.
 */
export async function setBaseCurrencyForActiveUser({ currencyCode }: { currencyCode: string }) {
  return makeRequest({
    method: 'post',
    url: '/user/currencies/base',
    payload: { currencyCode },
  });
}

export interface CreateInvitationPayload {
  inviteeEmail: string;
  resourceType: ResourceType;
  resourceId: number | string;
  permission: SharePermission;
  policy?: SharePolicy | null;
}

export async function createShareInvitation<R extends boolean | undefined = undefined>({
  raw,
  ...payload
}: CreateInvitationPayload & { raw?: R }) {
  return makeRequest<Awaited<ReturnType<typeof apiCreateInvitation>>['invitation'], R>({
    method: 'post',
    url: '/share/invitations',
    payload,
    raw,
  });
}

export async function listSentShareInvitations<R extends boolean | undefined = undefined>({ raw }: { raw?: R } = {}) {
  return makeRequest<Awaited<ReturnType<typeof apiListSentInvitations>>, R>({
    method: 'get',
    url: '/share/invitations/sent',
    raw,
  });
}

export async function listReceivedShareInvitations<R extends boolean | undefined = undefined>({
  raw,
}: { raw?: R } = {}) {
  return makeRequest<Awaited<ReturnType<typeof apiListReceivedInvitations>>, R>({
    method: 'get',
    url: '/share/invitations/received',
    raw,
  });
}

export async function acceptShareInvitation<R extends boolean | undefined = undefined>({
  token,
  raw,
}: {
  token: string;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof apiAcceptInvitation>>, R>({
    method: 'post',
    url: `/share/invitations/${encodeURIComponent(token)}/accept`,
    raw,
  });
}

export async function declineShareInvitation<R extends boolean | undefined = undefined>({
  token,
  raw,
}: {
  token: string;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof apiDeclineInvitation>>, R>({
    method: 'post',
    url: `/share/invitations/${encodeURIComponent(token)}/decline`,
    raw,
  });
}
