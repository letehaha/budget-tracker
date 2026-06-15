import { errorHandler } from '@controllers/helpers';
import { t } from '@i18n/index';
import { TooManyRequests } from '@js/errors';
import Users from '@models/users.model';
import { RateLimitService } from '@services/common/rate-limit.service';
import { getMaxSendInvitationsPerOwnerPer24h } from '@services/sharing/limits';
import type { NextFunction, Request, Response } from 'express';

interface RateLimitOptions {
  windowSeconds: number;
  maxAttempts?: number;
  keyGenerator?: (req: Request) => string;
}

/**
 * Wraps a middleware so it is bypassed only when `NODE_ENV === 'development'`.
 * Production runs the guard for real abuse protection; the test suite runs it
 * so the behavior can be asserted end-to-end. Local dev is opted out so a
 * developer mashing the export button doesn't lock themselves out.
 */
const nonDev =
  (middleware: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'development') return next();
    return middleware(req, res, next);
  };

/**
 * Creates a rate limiting middleware
 * @param options - Rate limiting configuration
 */
const createRateLimit = (options: RateLimitOptions) => {
  const { windowSeconds, maxAttempts = 1, keyGenerator } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Generate rate limit key
      const key = keyGenerator ? keyGenerator(req) : `${req.ip}:${req.route?.path || req.path}`;

      // Check rate limit
      const result = await RateLimitService.checkRateLimit(key, windowSeconds, maxAttempts);

      if (!result.allowed) {
        const error = new TooManyRequests({
          message: t({ key: 'middleware.tooManyRequests' }),
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
 * Rate limit for bulk price uploads (1 minute window, 5 attempts per user)
 * Prevents accidental DoS from repeated large uploads
 */
export const securitiesPricesBulkUploadRateLimit = createRateLimit({
  windowSeconds: 60, // 1 minute
  maxAttempts: 5,
  keyGenerator: (req: Request) => {
    const user = req.user as Users;
    return `securities-prices-bulk-upload:user:${user.id}`;
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

/**
 * CSV import rate limit (per user, 30 attempts per 5 minutes).
 * Bounds the cost of repeated 10MB CSV submissions across the import flow
 * (parse / extract-unique-values / detect-duplicates / execute).
 */
export const csvImportRateLimit = createRateLimit({
  windowSeconds: 5 * 60,
  maxAttempts: 30,
  keyGenerator: (req: Request) => {
    const user = req.user as Users;
    return `csv-import:user:${user.id}`;
  },
});

/**
 * Data-export rate limit (per user, 5 exports per 15 minutes).
 *
 * The export endpoint runs every transformer in parallel, materializes the
 * full result set in memory, and ties up the event loop for several seconds
 * during CSV/XLSX serialization. A click-storm or scripted spammer can
 * therefore degrade the API for every other request on the box.
 *
 * The window allows a real user to try JSON/CSV/XLSX back-to-back (or retry
 * a couple of times if a format reads wrong in their target tool) without
 * being blocked. The limiter is wrapped with `nonDev` so production enforces
 * it for abuse protection and the e2e suite enforces it for verification,
 * while local dev opts out.
 */
export const dataExportRateLimit = nonDev(
  createRateLimit({
    windowSeconds: 15 * 60,
    maxAttempts: 5,
    keyGenerator: (req: Request) => {
      const user = req.user as Users;
      return `data-export:user:${user.id}`;
    },
  }),
);

/**
 * Share-invitation send rate limit (per owner, 30 sends per 24h in prod, 5 in test).
 * Closes the cross-resource email-bombing gap that the per-resource pending cap and the
 * per-invitee resend rate limit don't cover (see PRD F11). Threshold is resolved at
 * module load via `getMaxSendInvitationsPerOwnerPer24h` so the test-env override is the
 * single source of truth.
 */
export const shareInvitationSendRateLimit = createRateLimit({
  windowSeconds: 24 * 60 * 60,
  maxAttempts: getMaxSendInvitationsPerOwnerPer24h(),
  keyGenerator: (req: Request) => {
    const user = req.user as Users;
    return `share-invitation-send:user:${user.id}`;
  },
});

/**
 * Logo search rate limit (per user, 60 searches per minute).
 *
 * Each call fans out to logo.dev's Brand Search API, which counts against a
 * shared API quota. The limit is generous enough not to block a fast typist
 * using live search but still closes the scripted-scraping gap.
 */
export const logoSearchRateLimit = createRateLimit({
  windowSeconds: 60,
  maxAttempts: 60,
  keyGenerator: (req: Request) => {
    const user = req.user as Users;
    return `logo-search:user:${user.id}`;
  },
});
