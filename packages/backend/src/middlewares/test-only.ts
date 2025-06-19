import { NotFoundError } from '@js/errors';
import type { NextFunction } from 'express';

/**
 * Middleware to ensure an endpoint is only accessible in a 'test' environment.
 * In any other environment, it will return a 404 Not Found error, effectively
 * hiding the endpoint's existence.
 */
export const testOnly = (req, res, next: NextFunction) => {
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  // For any other environment, treat the endpoint as if it doesn't exist.
  const error = new NotFoundError({
    message: 'Endpoint not found.',
  });

  return next(error);
};
