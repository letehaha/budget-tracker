import { errorHandler } from '@controllers/helpers';
import { TooManyRequests } from '@js/errors';
import Users from '@models/Users.model';
import { RateLimitService } from '@services/common/rate-limit.service';
import type { NextFunction, Request, Response } from 'express';

export interface RateLimitOptions {
  windowSeconds: number;
  maxAttempts?: number;
  keyGenerator?: (req: Request) => string;
}

/**
 * Creates a rate limiting middleware
 * @param options - Rate limiting configuration
 */
export const createRateLimit = (options: RateLimitOptions) => {
  const { windowSeconds, maxAttempts = 1, keyGenerator } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Generate rate limit key
      const key = keyGenerator ? keyGenerator(req) : `${req.ip}:${req.route?.path || req.path}`;

      // Check rate limit
      const result = await RateLimitService.checkRateLimit(key, windowSeconds, maxAttempts);

      if (!result.allowed) {
        const error = new TooManyRequests({
          message: 'Too many requests. Please try again later.',
          details: {
            retryAfter: result.remainingSeconds || 0,
            resetTime: result.resetTime?.toISOString(),
          },
        });

        // Add custom headers for rate limiting info
        res.set({
          'Retry-After': String(result.remainingSeconds || 0),
          'X-RateLimit-Limit': String(maxAttempts),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': result.resetTime?.getTime().toString() || '',
        });

        return errorHandler(res, error);
      }

      next();
    } catch (error) {
      // If rate limiting fails, log error but allow request to proceed
      console.error('Rate limiting error:', error);
      next();
    }
  };
};

/**
 * Rate limit for price sync operations (5 minutes window, 1 attempt per user)
 */
export const priceSyncRateLimit = createRateLimit({
  windowSeconds: 5 * 60, // 5 minutes
  maxAttempts: 1,
  keyGenerator: (req: Request) => {
    const user = req.user as Users;
    return `price-sync:user:${user.id}`;
  },
});

/**
 * General API rate limit (per user, 60 requests per minute)
 */
export const apiRateLimit = createRateLimit({
  windowSeconds: 60, // 1 minute
  maxAttempts: 60,
  keyGenerator: (req: Request) => {
    const user = req.user as Users;
    return user ? `api:user:${user.id}` : `api:ip:${req.ip}`;
  },
});

/**
 * Auth rate limit (per IP, 5 attempts per 15 minutes)
 */
export const authRateLimit = createRateLimit({
  windowSeconds: 15 * 60, // 15 minutes
  maxAttempts: 5,
  keyGenerator: (req: Request) => `auth:ip:${req.ip}`,
});
