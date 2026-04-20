import { API_ERROR_CODES, API_RESPONSE_STATUS } from '@bt/shared/types';
import { getCurrentSessionId } from '@common/lib/cls/session-id';
import { auth } from '@config/auth';
import { CacheClient } from '@js/utils/cache';
import { setSentryUser } from '@js/utils/sentry';
import Users from '@models/users.model';
import { NextFunction, Request, Response } from 'express';

type AppUser = Pick<Users, 'username' | 'id' | 'authUserId' | 'role'>;

const CACHE_KEY_PREFIX = 'auth_user:';

const appUserCache = new CacheClient<AppUser>({
  ttl: 60, // 60 seconds
  logPrefix: 'AuthUserCache',
});

/** Remove a user from the cache (e.g., after profile update). */
export function invalidateAppUserCache({ authUserId }: { authUserId: string }): void {
  appUserCache.delete(`${CACHE_KEY_PREFIX}${authUserId}`);
}

/**
 * Middleware to authenticate requests using better-auth sessions.
 *
 * This middleware:
 * 1. Validates the session using better-auth
 * 2. Looks up the app user by authUserId
 * 3. Attaches the user to req.user for downstream handlers
 */
export const authenticateSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // better-auth expects a Fetch API Headers instance, not Express's plain
    // headers object. Cast-only was silently throwing inside getSession.
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }

    const session = await auth.api.getSession({ headers });

    if (!session || !session.user) {
      return res.status(401).json({
        status: API_RESPONSE_STATUS.error,
        response: {
          message: 'Unauthorized',
          code: API_ERROR_CODES.unauthorized,
        },
      });
    }

    const authUserId = session.user.id;
    const cacheKey = `${CACHE_KEY_PREFIX}${authUserId}`;

    // Check Redis cache first
    let user = await appUserCache.read(cacheKey);

    if (!user) {
      // Cache miss — look up the app user by authUserId
      user = (await Users.findOne({
        where: { authUserId },
        attributes: ['username', 'id', 'authUserId', 'role'],
        raw: true,
      })) as AppUser | null;

      if (user) {
        await appUserCache.write({ key: cacheKey, value: user });
      }
    }

    if (!user) {
      return res.status(401).json({
        status: API_RESPONSE_STATUS.error,
        response: {
          message: 'User not found',
          code: API_ERROR_CODES.unauthorized,
        },
      });
    }

    // Attach user to request for downstream handlers
    req.user = user;

    // Set user context for Sentry error tracking (includes sessionId for correlation)
    setSentryUser({
      userId: user.id,
      username: user.username,
      email: session.user.email,
      sessionId: getCurrentSessionId(),
    });

    next();
  } catch {
    return res.status(401).json({
      status: API_RESPONSE_STATUS.error,
      response: {
        message: 'Authentication failed',
        code: API_ERROR_CODES.unauthorized,
      },
    });
  }
};
