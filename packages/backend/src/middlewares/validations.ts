import { API_ERROR_CODES, API_RESPONSE_STATUS } from '@bt/shared/types/api';
import { CustomRequest, CustomResponse } from '@common/types';
import { ERROR_CODES } from '@js/errors';
import { logger } from '@js/utils';
import { NextFunction, Request } from 'express';
import { ZodError, ZodType } from 'zod';

export const validateEndpoint =
  <T extends ZodType>(schema: T) =>
  (req: Request, res: CustomResponse, next: NextFunction) => {
    try {
      (req as CustomRequest<T>).validated = schema.parse({
        body: req.body,
        params: req.params,
        query: req.query,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
        return res.status(ERROR_CODES.ValidationError).json({
          status: API_RESPONSE_STATUS.error,
          response: {
            message,
            validationErrors: error.errors,
            code: API_ERROR_CODES.validationError,
          },
        });
      } else {
        logger.error(error as Error);
        return res.status(ERROR_CODES.UnexpectedError).json({
          status: API_RESPONSE_STATUS.error,
          response: {
            message: 'Unexpected error',
            code: API_ERROR_CODES.unexpected,
          },
        });
      }
    }
  };
