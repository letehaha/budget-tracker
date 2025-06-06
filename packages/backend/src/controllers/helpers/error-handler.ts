import { API_ERROR_CODES, API_RESPONSE_STATUS } from '@bt/shared/types';
import { CustomResponse } from '@common/types';
import { CustomError } from '@js/errors';
import { logger } from '@js/utils/logger';

export function errorHandler(res: CustomResponse, err: Error) {
  if (err instanceof CustomError) {
    return res.status(err.httpCode).json({
      status: API_RESPONSE_STATUS.error,
      response: {
        message: err.message,
        code: err.code,
        details: err.details,
      },
    });
  }

  logger.error(err as Error);
  return res.status(500).json({
    status: API_RESPONSE_STATUS.error,
    response: {
      message: 'Unexpected error.',
      code: API_ERROR_CODES.unexpected,
    },
  });
}
