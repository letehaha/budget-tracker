import { errorHandler } from '@controllers/helpers';
import { t } from '@i18n/index';
import { TooManyRequests } from '@js/errors';
import { logger } from '@js/utils';
import Users from '@models/users.model';
import { RateLimitService } from '@services/common/rate-limit.service';
import { getMaxSendInvitationsPerOwnerPer24h } from '@services/sharing/limits';
import type { NextFunction, Request, Response } from 'express';

interface RateLimitOptions {
  windowSeconds: number;
  maxAttempts?: number;
  keyGenerator?: (req: Request) => string;
  /**
   * When true, a Redis/rate-limit-service failure returns the same 429 as a
   * real limit hit instead of letting the request through. Reserve it for
   * guards where unlimited access during a Redis blip is worse than a false
   * 429; cheap read endpoints stay fail-open.
   */
  failClosed?: boolean;
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
 * Sends the 429 response shape shared by an actual limit hit and a
 * fail-closed error, so callers see one consistent contract either way.
 */
const respondTooManyRequests = ({
  res,
  maxAttempts,
  retryAfterSeconds,
  resetTime,
}: {
  res: Response;
  maxAttempts: number;
  retryAfterSeconds: number;
  resetTime?: Date;
}) => {
  const error = new TooManyRequests({
    message: t({ key: 'middleware.tooManyRequests' }),
    details: {
      retryAfter: retryAfterSeconds,
      resetTime: resetTime?.toISOString(),
    },
  });

  res.set({
    'Retry-After': String(retryAfterSeconds),
    'X-RateLimit-Limit': String(maxAttempts),
    'X-RateLimit-Remaining': '0',
    'X-RateLimit-Reset': resetTime?.getTime().toString() || '',
  });

  return errorHandler(res, error);
};

/**
 * Creates a rate limiting middleware
 * @param options - Rate limiting configuration
 */
const createRateLimit = (options: RateLimitOptions) => {
  const { windowSeconds, maxAttempts = 1, keyGenerator, failClosed = false } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Generate rate limit key
      const key = keyGenerator ? keyGenerator(req) : `${req.ip}:${req.route?.path || req.path}`;

      // `serviceUnavailable` means Redis was unreachable; `allowed: true` is a
      // fallback, not a real count. The service already logged it, so only
      // act on `failClosed` here.
      const result = await RateLimitService.checkRateLimit(key, windowSeconds, maxAttempts);

      if (result.serviceUnavailable && failClosed) {
        return respondTooManyRequests({ res, maxAttempts, retryAfterSeconds: windowSeconds });
      }

      if (!result.allowed) {
        return respondTooManyRequests({
          res,
          maxAttempts,
          retryAfterSeconds: result.remainingSeconds || 0,
          resetTime: result.resetTime,
        });
      }

      next();
    } catch (error) {
      // checkRateLimit never rejects. This catch only fires for bugs elsewhere
      // in the middleware (e.g. a throwing keyGenerator), so it never
      // double-logs a Redis outage the service already reported.
      logger.error(error as Error, { context: 'rate-limit middleware failed to check limit', failClosed });

      if (failClosed) {
        return respondTooManyRequests({ res, maxAttempts, retryAfterSeconds: windowSeconds });
      }

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
 * Demo-start rate limit (per IP, 10 attempts per 15 minutes).
 *
 * The key prefix scopes to this endpoint alone, so a shared IP (an office, a
 * campus, carrier NAT) only burns its own demo-start budget. `failClosed`
 * because this guards the app's most expensive unauthenticated route, so a
 * Redis outage must not open unlimited demo provisioning.
 */
export const demoStartRateLimit = createRateLimit({
  windowSeconds: 15 * 60,
  maxAttempts: 10,
  keyGenerator: (req: Request) => `demo-start:ip:${req.ip}`,
  failClosed: true,
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
 * Per-user rate limit (5 attempts per 15 minutes) enforced everywhere except
 * local dev. Shared by the heavyweight export/backup/restore endpoints, which
 * each materialize or rewrite the user's full data on the API thread and so can
 * degrade the whole box under a click-storm. They differ only by Redis key
 * prefix, which keeps each endpoint's budget independent.
 */
const perUserNonDevRateLimit = ({ prefix }: { prefix: string }) =>
  nonDev(
    createRateLimit({
      windowSeconds: 15 * 60,
      maxAttempts: 5,
      keyGenerator: (req: Request) => {
        const user = req.user as Users;
        return `${prefix}:user:${user.id}`;
      },
    }),
  );

/**
 * Data-export rate limit. The export endpoint runs every transformer in
 * parallel, materializes the full result set in memory, and ties up the event
 * loop for several seconds during CSV/XLSX serialization. The window allows a
 * real user to try JSON/CSV/XLSX back-to-back without being blocked.
 */
export const dataExportRateLimit = perUserNonDevRateLimit({ prefix: 'data-export' });

/**
 * Backup export rate limit. A backup dumps every user-owned table as raw JSON
 * and DEFLATE-compresses the result on the API thread, so a click-storm can tie
 * up the event loop.
 */
export const backupRateLimit = perUserNonDevRateLimit({ prefix: 'backup' });

/**
 * Backup restore rate limit. A restore wipes and re-inserts every user-owned
 * table inside one transaction, far heavier than an export. Its own key keeps a
 * user's downloads and restores from draining a shared budget.
 */
export const backupRestoreRateLimit = perUserNonDevRateLimit({ prefix: 'backup-restore' });

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
