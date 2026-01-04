import { API_ERROR_CODES, API_RESPONSE_STATUS } from '@bt/shared/types';
import { ERROR_CODES } from '@js/errors';
import Users from '@models/Users.model';
import type { NextFunction, Request, Response } from 'express';

/**
 * Middleware to ensure an endpoint is only accessible by admin users.
 * Checks if the authenticated user's email is in the ADMIN_USERS environment variable.
 * If not authorized, returns a 401 Unauthorized error.
 */
export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
  const adminUsers = process.env.ADMIN_USERS?.split(',').map((username) => username.trim()) || [];

  if (adminUsers.length === 0) {
    return res.status(ERROR_CODES.Unauthorized).json({
      status: API_RESPONSE_STATUS.error,
      response: {
        message: 'Admin functionality is not configured.',
        code: API_ERROR_CODES.unauthorized,
      },
    });
  }

  // Assumes user is already authenticated via authenticateSession middleware
  const username = (req.user as Users)?.username;

  if (!username) {
    return res.status(ERROR_CODES.Unauthorized).json({
      status: API_RESPONSE_STATUS.error,
      response: {
        message: 'Authentication required.',
        code: API_ERROR_CODES.unauthorized,
      },
    });
  }

  if (!adminUsers.includes(username)) {
    return res.status(ERROR_CODES.Unauthorized).json({
      status: API_RESPONSE_STATUS.error,
      response: {
        message: 'Admin privileges required.',
        code: API_ERROR_CODES.unauthorized,
      },
    });
  }

  return next();
};
