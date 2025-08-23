import { Unauthorized } from '@js/errors';
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
    const error = new Unauthorized({
      message: 'Admin functionality is not configured.',
    });
    return next(error);
  }

  // Assumes user is already authenticated via authenticateJwt middleware
  const username = (req.user as Users)?.username;

  if (!username) {
    const error = new Unauthorized({
      message: 'Authentication required.',
    });
    return next(error);
  }

  if (!adminUsers.includes(username)) {
    const error = new Unauthorized({
      message: 'Admin privileges required.',
    });
    return next(error);
  }

  return next();
};
