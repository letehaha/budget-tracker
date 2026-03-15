import { API_ERROR_CODES, API_RESPONSE_STATUS, USER_ROLES } from '@bt/shared/types';
import { ERROR_CODES } from '@js/errors';
import Users from '@models/Users.model';
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
