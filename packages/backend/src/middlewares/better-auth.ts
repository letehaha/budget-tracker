import { API_ERROR_CODES, API_RESPONSE_STATUS } from '@bt/shared/types';
import { getCurrentSessionId } from '@common/lib/cls/session-id';
import { auth } from '@config/auth';
import { setSentryUser } from '@js/utils/sentry';
import Users from '@models/Users.model';
import { NextFunction, Request, Response } from 'express';

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
    // Get session from better-auth using request headers (cookies)
    const session = await auth.api.getSession({
      headers: req.headers as unknown as Headers,
    });

    if (!session || !session.user) {
      return res.status(401).json({
        status: API_RESPONSE_STATUS.error,
        response: {
          message: 'Unauthorized',
          code: API_ERROR_CODES.unauthorized,
        },
      });
    }

    // Look up the app user by authUserId
    const user = (await Users.findOne({
      where: { authUserId: session.user.id },
      attributes: ['username', 'id', 'authUserId', 'role'],
      raw: true,
    })) as Pick<Users, 'username' | 'id' | 'authUserId' | 'role'> | null;

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
  } catch (error) {
    return res.status(401).json({
      status: API_RESPONSE_STATUS.error,
      response: {
        message: 'Authentication failed',
        code: API_ERROR_CODES.unauthorized,
      },
    });
  }
};
