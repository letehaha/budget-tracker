import { API_ERROR_CODES, API_RESPONSE_STATUS } from '@bt/shared/types';
import { ERROR_CODES } from '@js/errors';
import Users from '@models/Users.model';
import { redisClient } from '@root/redis-client';
import { buildLockKey } from '@root/services/currencies/change-base-currency.service';
import type { NextFunction, Request, Response } from 'express';

/**
 * Middleware to check if a base currency change operation is in progress for the user.
 * If a lock exists, it returns a 423 Locked error with a specific error code
 * so the frontend can handle it appropriately.
 *
 * This prevents users from creating/updating accounts, transactions, or investments
 * while base currency recalculation is happening, ensuring data consistency.
 */
export const checkBaseCurrencyLock = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void | Response> => {
  // Assumes user is already authenticated via authenticateJwt middleware
  const userId = (req.user as Users)?.id;

  if (!userId) {
    return res.status(ERROR_CODES.Unauthorized).json({
      status: API_RESPONSE_STATUS.error,
      response: {
        message: 'Authentication required.',
        code: API_ERROR_CODES.unauthorized,
      },
    });
  }

  // Check if base currency change is in progress for this user
  const lockExists = await redisClient.get(buildLockKey(userId));

  if (lockExists) {
    return res.status(ERROR_CODES.Locked).json({
      status: API_RESPONSE_STATUS.error,
      response: {
        message: 'Base currency change is in progress. Please wait until it completes.',
        code: API_ERROR_CODES.baseCurrencyChangeInProgress,
      },
    });
  }

  return next();
};
