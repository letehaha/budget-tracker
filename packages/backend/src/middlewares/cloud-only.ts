import { isSelfHost } from '@config/is-self-host';
import { errorHandler } from '@controllers/helpers';
import { NotFoundError } from '@js/errors';
import type { NextFunction, Request, Response } from 'express';

/** Billing has no meaning on a self-hosted instance; the routes answer 404 there. */
export const cloudOnly = (_req: Request, res: Response, next: NextFunction) => {
  if (isSelfHost()) {
    return errorHandler(res, new NotFoundError({ message: 'Not available on self-hosted instances.' }));
  }
  return next();
};
