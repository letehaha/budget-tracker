import { loggerNamespace } from '@common/lib/cls/logging';
import { v4 as uuidv4 } from 'uuid';

export const requestIdMiddleware = (req, res, next) => {
  const requestId = uuidv4(); // Generate a unique ID for every request
  req.requestId = requestId;

  res.setHeader('X-Request-Id', req.requestId); // Expose it in response headers

  loggerNamespace.run(() => {
    loggerNamespace.set('requestId', requestId);
    loggerNamespace.set('req', req);
    next();
  });
};
