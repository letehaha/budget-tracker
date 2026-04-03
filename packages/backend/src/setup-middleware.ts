import { logger } from '@js/utils/logger';
import { requestIdMiddleware } from '@middlewares/request-id';
import { sessionMiddleware } from '@middlewares/session-id';
import cors from 'cors';
import express, { Express, Request } from 'express';
import morgan from 'morgan';

import { API_PREFIX } from './config';
import { addI18nextToRequest, detectLanguage } from './i18n/middleware';

export function setupMiddleware(app: Express) {
  app.use(requestIdMiddleware);

  app.set('port', process.env.APPLICATION_PORT);

  const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // MCP/OAuth paths must allow any origin (MCP spec requires CORS for browser-based clients
  // like Claude.ai that perform discovery and registration from the browser)
  const MCP_CORS_PREFIX_PATHS = ['/.well-known/', `${API_PREFIX}/mcp`, `${API_PREFIX}/auth/oauth2/`];
  // Claude.ai ignores AS metadata and hardcodes /authorize, /token, /register on the
  // base URL (see setup-routes.ts oauthProxyPaths). These 307-redirect endpoints still
  // need permissive CORS so the browser preflight succeeds before the redirect.
  // WARNING: keep in sync with oauthProxyPaths in setup-routes.ts.
  const MCP_CORS_EXACT_PATHS = new Set(['/authorize', '/token', '/register']);

  const mcpCors = cors({
    origin: true,
    credentials: true,
    exposedHeaders: ['x-session-id', 'x-request-id'],
  });

  const appCors = cors({
    origin(requestOrigin, callback) {
      if (process.env.NODE_ENV === 'test' || !requestOrigin) {
        return callback(null, true);
      }

      if (ALLOWED_ORIGINS.includes(requestOrigin)) {
        return callback(null, true);
      }

      // Silently reject - don't throw error to avoid Sentry noise
      return callback(null, false);
    },
    credentials: true,
    exposedHeaders: ['x-session-id', 'x-request-id'],
  });

  app.use((req, res, next) => {
    const isMcpPath = MCP_CORS_PREFIX_PATHS.some((p) => req.path.startsWith(p)) || MCP_CORS_EXACT_PATHS.has(req.path);
    if (isMcpPath) {
      return mcpCors(req, res, next);
    }
    return appCors(req, res, next);
  });

  logger.info(`CORS configured with origins: ${ALLOWED_ORIGINS}`);

  // Paths that need raw body preserved (for signature verification)
  // Note: These paths should include the full path WITH API_PREFIX because
  // this middleware runs before route mounting, so req.path contains full path
  const rawBodyPaths = [`${API_PREFIX}/webhooks/github`];

  // Body parser with conditional limits
  app.use((req, res, next) => {
    // Skip body parsing for better-auth routes — toNodeHandler reads the raw
    // request stream and re-parses the body itself.  If Express consumes the
    // stream first (especially for application/x-www-form-urlencoded), the
    // body gets re-serialized as JSON while the Content-Type header stays
    // urlencoded, causing a parsing mismatch in better-call.
    if (req.path.startsWith(`${API_PREFIX}/auth/`)) {
      return next();
    }

    // Paths that need larger payloads
    const largePaths = {
      '1mb': [`${API_PREFIX}/investments/securities/prices/bulk-upload`],
      '10mb': [
        `${API_PREFIX}/import/csv/parse`,
        `${API_PREFIX}/import/csv/extract-unique-values`,
        `${API_PREFIX}/import/csv/detect-duplicates`,
        `${API_PREFIX}/import/csv/execute`,
        // Statement parser endpoints need 10MB for base64 encoded files (max 10MB = ~13.3MB base64)
        `${API_PREFIX}/import/text-source/estimate-cost`,
        `${API_PREFIX}/import/text-source/extract`,
      ],
    };

    // For webhook paths, preserve raw body for signature verification
    // Use req.originalUrl to ensure we match the full path regardless of mounting
    if (rawBodyPaths.some((p) => req.originalUrl.startsWith(p))) {
      return express.json({
        verify: (rawReq, _res, buf) => {
          (rawReq as Request & { rawBody?: Buffer }).rawBody = buf;
        },
      })(req, res, next);
    }

    // Check each limit size and apply if path matches
    for (const [limit, paths] of Object.entries(largePaths)) {
      if (paths.includes(req.path)) {
        return express.json({ limit })(req, res, next);
      }
    }

    return express.json()(req, res, next);
  });

  app.use((req, res, next) => {
    if (req.path.startsWith(`${API_PREFIX}/auth/`)) return next();
    express.urlencoded({ extended: false })(req, res, next);
  });
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }
  app.use(sessionMiddleware);
  // i18next language detection middleware (uses Accept-Language header from frontend)
  app.use(detectLanguage);
  app.use(addI18nextToRequest);
}
