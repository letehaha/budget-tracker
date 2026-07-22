import { API_ERROR_CODES, API_RESPONSE_STATUS } from '@bt/shared/types';
import { t } from '@i18n/index';
import { ERROR_CODES } from '@js/errors';
import { logger } from '@js/utils/logger';
import Users from '@models/users.model';
import { isBaseCurrencyChangeLocked } from '@services/currencies/base-currency-lock';
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
  // Assumes user is already authenticated via authenticateSession middleware
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

  // Fail closed on a Redis hiccup. Express 4 doesn't catch async rejections, so an
  // unhandled throw here would hang the request forever with no response — respond
  // 503 and let the client retry instead.
  let lockExists: boolean;
  try {
    lockExists = await isBaseCurrencyChangeLocked({ userId });
  } catch (error) {
    logger.error({
      message: 'Base currency lock check failed',
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return res.status(ERROR_CODES.ServiceUnavailable).json({
      status: API_RESPONSE_STATUS.error,
      response: {
        message: t({ key: 'common.serviceTemporarilyUnavailable' }),
        code: API_ERROR_CODES.serviceUnavailable,
      },
    });
  }

  if (lockExists) {
    return res.status(ERROR_CODES.Locked).json({
      status: API_RESPONSE_STATUS.error,
      response: {
        message: t({ key: 'currencies.baseCurrencyChangeInProgress' }),
        code: API_ERROR_CODES.baseCurrencyChangeInProgress,
      },
    });
  }

  return next();
};
