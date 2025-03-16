import { sessionIdNamespace } from '@common/lib/cls/session-id';
import { SESSION_ID_KEY_NAME } from '@common/types';
import { logger } from '@js/utils';
import { createHmac } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

const SECRET_KEY = process.env.APP_SESSION_ID_SECRET as string;

export const sessionMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  if (!SECRET_KEY) {
    logger.error('"sessionMiddleware": secrey key is missing!');
    return next();
  }

  try {
    let sessionId: string | null = null;

    const token = req.headers['x-session-id'];

    // Take session id from the request's headers
    if (token && typeof token === 'string') {
      const decoded = verifySignedSessionId(token);

      // if session id is valid, use it
      // WARNING: might want to throw 403 error in the future, if session_id is used
      // not only for logs
      if (decoded) {
        sessionId = token;
      }
    }

    // if session id previously wasn't validated, generate a new one
    if (!sessionId) {
      sessionId = generateSignedSessionId();
    }

    if (sessionId) {
      res.setHeader('X-Session-ID', sessionId);

      sessionIdNamespace.run(() => {
        sessionIdNamespace.set(SESSION_ID_KEY_NAME, sessionId);
        sessionIdNamespace.set('req', req);

        req[SESSION_ID_KEY_NAME] = sessionId;
        next();
      });
    } else {
      logger.warn('"sessionMiddleware": wasnt able to set sessionId for unexpected reasons.');
      next();
    }
  } catch (err) {
    logger.error('"sessionMiddleware" failed due to unexpected error');
    next();
  }
};

// Generate a signed sessionId
const generateSignedSessionId = () => {
  const sessionId = uuidv4();
  const signature = createHmac('sha256', SECRET_KEY).update(sessionId).digest('hex');
  return `${sessionId}.${signature}`;
};

// Verify a signed sessionId
const verifySignedSessionId = (signedSessionId: string) => {
  const [sessionId, signature] = signedSessionId.split('.');
  if (!sessionId || !signature) {
    return false;
  }

  const expectedSignature = createHmac('sha256', SECRET_KEY).update(sessionId).digest('hex');

  if (!expectedSignature) logger.warn('Session ID validation failed.');

  return signature === expectedSignature;
};
