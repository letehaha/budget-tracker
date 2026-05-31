import { API_ERROR_CODES, API_RESPONSE_STATUS, USER_ROLES } from '@bt/shared/types';
import { ERROR_CODES } from '@js/errors';
import { logger } from '@js/utils';
import type Users from '@models/users.model';
import type { NextFunction, Request, Response } from 'express';

/**
 * Middleware to block demo users from accessing certain endpoints.
 * Demo users are restricted from:
 * - Bank connections
 * - OAuth linking
 * - Passkey registration
 * - Email/password changes
 *
 * Returns 403 Forbidden with a message explaining the restriction.
 */
export const blockDemoUsers = (req: Request, res: Response, next: NextFunction) => {
  // Assumes user is already authenticated via authenticateSession middleware
  const user = req.user as Users;

  if (!user) {
    // Reaching this branch means `authenticateSession` is missing upstream on the route —
    // `req.user` should always be populated by the time we get here. Log loudly so the gap
    // is caught in development/staging rather than silently returning 401 in prod.
    logger.error(
      { message: 'blockDemoUsers: req.user missing — authenticateSession likely not mounted on this route' },
      { path: req.path, method: req.method },
    );
    return res.status(ERROR_CODES.Unauthorized).json({
      status: API_RESPONSE_STATUS.error,
      response: {
        message: 'Authentication required.',
        code: API_ERROR_CODES.unauthorized,
      },
    });
  }

  if (user.role === USER_ROLES.demo) {
    return res.status(ERROR_CODES.Forbidden).json({
      status: API_RESPONSE_STATUS.error,
      response: {
        message: 'This feature is not available in demo mode. Sign up for a free account to unlock all features.',
        code: API_ERROR_CODES.forbidden,
      },
    });
  }

  return next();
};
