import { API_RESPONSE_STATUS } from '@bt/shared/types';
import { CustomRequest, CustomResponse } from '@common/types';
import { errorHandler } from '@controllers/helpers';
import { Request, Response } from 'express';
import { z } from 'zod';

type ValidatedData<T extends z.ZodType> = z.infer<T>;

type HandlerParams<T extends z.ZodType> = {
  user: CustomRequest<T>['user'];
  params: ValidatedData<T> extends { params: infer P } ? P : Record<string, never>;
  query: ValidatedData<T> extends { query: infer Q } ? Q : Record<string, never>;
  body: ValidatedData<T> extends { body: infer B } ? B : Record<string, never>;
  req: Request;
  res: Response;
};

type ControllerResponse<T = unknown> = {
  data?: T;
  statusCode?: number;
};

type HandlerFunction<T extends z.ZodType> = (params: HandlerParams<T>) => Promise<ControllerResponse | void>;

export function createController<T extends z.ZodType>(schema: T, handler: HandlerFunction<T>) {
  return {
    schema,
    handler: async (_req: Request, res: CustomResponse): Promise<CustomResponse> => {
      const req = _req as CustomRequest<T>;

      try {
        const result = await handler({
          req: _req,
          res: res,
          user: req.user,
          params: req.validated.params || {},
          query: req.validated.query || {},
          body: req.validated.body || {},
        });

        const statusCode = result?.statusCode || 200;

        if (!result || result.data === undefined) {
          return res.status(statusCode).json({
            status: API_RESPONSE_STATUS.success,
          });
        }

        return res.status(statusCode).json({
          status: API_RESPONSE_STATUS.success,
          response: result.data,
        });
      } catch (err) {
        return errorHandler(res, err as Error);
      }
    },
  };
}
