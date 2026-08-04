import { isCustomModelId } from '@bt/shared/types';
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
   * When true, a Redis failure returns 429 instead of letting the request through.
   * For guards where unlimited access during a Redis blip is worse than a false 429;
   * cheap read endpoints stay fail-open.
   */
  failClosed?: boolean;
}

/**
 * Bypasses a middleware only when `NODE_ENV === 'development'`, so the test suite
 * still asserts the guard end-to-end while a developer mashing the export button
 * locally doesn't lock themselves out.
 */
const nonDev =
  (middleware: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'development') return next();
    return middleware(req, res, next);
  };

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

const createRateLimit = (options: RateLimitOptions) => {
  const { windowSeconds, maxAttempts = 1, keyGenerator, failClosed = false } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = keyGenerator ? keyGenerator(req) : `${req.ip}:${req.route?.path || req.path}`;

      // `serviceUnavailable` means Redis was unreachable; `allowed: true` is a
      // fallback, not a real count. The service already logged it.
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
      // checkRateLimit never rejects, so this only fires for bugs elsewhere in
      // the middleware (e.g. a throwing keyGenerator).
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
  windowSeconds: 5 * 60,
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
  windowSeconds: 60,
  maxAttempts: 5,
  keyGenerator: (req: Request) => {
    const user = req.user as Users;
    return `securities-prices-bulk-upload:user:${user.id}`;
  },
});

/**
 * Demo-start rate limit (per IP, 10 attempts per 15 minutes). The key prefix scopes to
 * this endpoint alone, so a shared IP (office, campus, carrier NAT) only burns its own
 * demo budget. `failClosed` so a Redis outage can't open unlimited demo provisioning on
 * the app's most expensive unauthenticated route.
 */
export const demoStartRateLimit = createRateLimit({
  windowSeconds: 15 * 60,
  maxAttempts: 10,
  keyGenerator: (req: Request) => `demo-start:ip:${req.ip}`,
  failClosed: true,
});

/**
 * CSV import rate limit (per user, 30 attempts per 5 minutes). Bounds the cost of repeated
 * 10MB CSV submissions across the whole import flow, not just one step.
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
 * Per-user limit shared by the export/backup/restore endpoints. The prefix keeps each
 * endpoint's budget independent.
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
 * Data-export rate limit. The export runs every transformer in parallel, holds the full
 * result set in memory, and ties up the event loop for seconds during CSV/XLSX
 * serialization. 5 attempts still lets a user try JSON/CSV/XLSX back-to-back.
 */
export const dataExportRateLimit = perUserNonDevRateLimit({ prefix: 'data-export' });

/**
 * Backup export rate limit. A backup dumps every user-owned table as raw JSON and
 * DEFLATE-compresses it on the API thread, tying up the event loop.
 */
export const backupRateLimit = perUserNonDevRateLimit({ prefix: 'backup' });

/**
 * Backup restore rate limit. A restore wipes and re-inserts every user-owned table in one
 * transaction, far heavier than an export, and its own key keeps downloads and restores
 * from draining a shared budget.
 */
export const backupRestoreRateLimit = perUserNonDevRateLimit({ prefix: 'backup-restore' });

/**
 * Microsoft Money upload rate limit. The upload buffers a file of up to 50MB and
 * decrypts and parses it synchronously on the API thread, so it is far heavier
 * than the id-and-mapping steps that follow it and must not share their
 * permissive budget. Runs before the body is read, so a blocked caller never
 * gets to send the bytes.
 */
export const msMoneyUploadRateLimit = perUserNonDevRateLimit({ prefix: 'ms-money-upload' });

/**
 * Resource-lease refresh rate limit (per user, 150 refreshes per 5 minutes).
 *
 * A refresh rewrites a few bytes of lease metadata, so the concern is call
 * volume rather than cost per call. An active client refreshes every 30s, which
 * is 10 per window — even several wizard tabs open at once stay an order of
 * magnitude under the cap, while a scripted flood still trips it in seconds.
 * Sharing the ordinary import budget instead would let a normal-length session
 * lock the user out of the import steps themselves.
 */
export const resourceLeaseRefreshRateLimit = createRateLimit({
  windowSeconds: 5 * 60,
  maxAttempts: 150,
  keyGenerator: (req: Request) => {
    const user = req.user as Users;
    return `resource-lease-refresh:user:${user.id}`;
  },
});

/**
 * Share-invitation send rate limit (per owner, 30 sends per 24h in prod, 5 in test).
 * Closes the email-bombing gap the per-resource pending cap and the per-invitee resend
 * limit miss. The threshold is read at module load so the test-env override is the single
 * source of truth.
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
 * Custom AI endpoint probe rate limit (per user, 15 attempts per minute). One budget shared
 * by create, update, test and feature-config writes, since each makes the server dial a
 * user-supplied URL. Fail-open, so a Redis blip can't break the settings page, where saving
 * an endpoint depends on a probe succeeding.
 */
export const aiCustomEndpointTestRateLimit = createRateLimit({
  windowSeconds: 60,
  maxAttempts: 15,
  keyGenerator: (req: Request) => {
    const user = req.user as Users;
    return `ai-custom-endpoint-test:user:${user.id}`;
  },
});

/**
 * Applies the probe budget to a feature-config write only when the body carries a `custom/*`
 * model, the only case that dials the user's endpoint. Runs ahead of schema validation, so
 * the body is still unvalidated input here.
 */
export const aiCustomModelProbeRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const modelId = (req.body as { modelId?: unknown } | undefined)?.modelId;

  if (typeof modelId !== 'string' || !isCustomModelId({ modelId })) {
    return next();
  }

  return aiCustomEndpointTestRateLimit(req, res, next);
};

/**
 * Logo search rate limit (per user, 60 searches per minute). Each call hits logo.dev's Brand
 * Search API against a shared quota. Generous enough for a fast typist using live search,
 * tight enough to block scripted scraping.
 */
export const logoSearchRateLimit = createRateLimit({
  windowSeconds: 60,
  maxAttempts: 60,
  keyGenerator: (req: Request) => {
    const user = req.user as Users;
    return `logo-search:user:${user.id}`;
  },
});
