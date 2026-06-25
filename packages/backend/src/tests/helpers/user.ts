import { UserModel } from '@bt/shared/types';

import { makeRequest } from './common';

/**
 * `GET /user` returns the authenticated user's row enriched with `email` and
 * `isAdmin`. Tests use it to read server-derived defaults (e.g.
 * `defaultCategoryId`) instead of assuming what the seed produced.
 */
type UserInfoResponse = Omit<UserModel, 'email' | 'isAdmin'> & { email: string | null; isAdmin: boolean };

export async function getUserInfo<R extends boolean | undefined = undefined>({ raw }: { raw?: R } = {}) {
  return makeRequest<UserInfoResponse, R>({
    method: 'get',
    url: '/user',
    raw,
  });
}
