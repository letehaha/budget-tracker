import './bootstrap';
import './redis-client';

import { requestContext } from '@common/request-context';
import { logger } from '@js/utils/logger';
import { shutdownPostHog } from '@js/utils/posthog';
import { Sentry } from '@js/utils/sentry';
import { requestIdMiddleware } from '@middlewares/request-id';
import { sessionMiddleware } from '@middlewares/session-id';
import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express, { Request, Response } from 'express';
import fs from 'fs';
import https from 'https';
import morgan from 'morgan';
import path from 'path';

import { API_PREFIX } from './config';
import { auth } from './config/auth';
import { demoCleanupCron } from './crons/demo-cleanup';
import { demoTemplateRefreshCron } from './crons/demo-template-refresh';
import { loadCurrencyRatesJob } from './crons/exchange-rates';
import { securitiesDailySyncCron } from './crons/securities-daily-sync';
import { subscriptionCandidateDetectionCron } from './crons/subscription-candidate-detection';
import { tagRemindersCron } from './crons/tag-reminders-check';
import { SUPPORTED_LOCALES } from './i18n';
import { addI18nextToRequest, detectLanguage } from './i18n/middleware';
import accountGroupsRoutes from './routes/account-groups';
import accountsRoutes from './routes/accounts.route';
/**
 *  Routes
 * */
import bankDataProvidersRoutes from './routes/bank-data-providers.route';
import betterAuthExtensionsRoutes from './routes/better-auth-extensions.route';
import budgetsRoutes from './routes/budgets.route';
import categoriesRoutes from './routes/categories.route';
import binanceRoutes from './routes/crypto/binance.route';
import modelsCurrenciesRoutes from './routes/currencies.route';
import demoRoutes from './routes/demo.route';
import exchangeRatesRoutes from './routes/exchange-rates';
import githubRoutes from './routes/github.route';
import csvImportExportRoutes from './routes/import-export/csv.route';
import statementParserRoutes from './routes/import-export/text-source.route';
import investmentsRoutes from './routes/investments.route';
import notificationsRoutes from './routes/notifications.route';
import sseRoutes from './routes/sse.route';
import statsRoutes from './routes/stats.route';
import subscriptionsRoutes from './routes/subscriptions.route';
import tagRemindersRoutes from './routes/tag-reminders.route';
import tagsRoutes from './routes/tags.route';
import testsRoutes from './routes/tests.route';
import transactionsRoutes from './routes/transactions.route';
import userRoutes from './routes/user.route';
import usersRoutes from './routes/users.route';
import webhooksRoutes from './routes/webhooks.route';
import { registerAiCategorizationListeners } from './services/ai-categorization';
import { initializeBankProviders } from './services/bank-data-providers/initialize-providers';
import { initializeHistoricalRates } from './services/exchange-rates/initialize-historical-rates.service';
import { initializeExchangeRateProviders } from './services/exchange-rates/providers';
import { registerSubscriptionMatchingListeners } from './services/subscriptions';
import { registerTagReminderListeners } from './services/tag-reminders';

logger.info('Starting application initialization...');

export const app = express();

// Authentication is now handled by better-auth (session-based)
// The better-auth handler is mounted at /api/v1/auth/* below

app.use(requestIdMiddleware);

app.set('port', process.env.APPLICATION_PORT);

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
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
  }),
);

logger.info(`CORS configured with origins: ${ALLOWED_ORIGINS}`);

// Paths that need raw body preserved (for signature verification)
// Note: These paths should include the full path WITH API_PREFIX because
// this middleware runs before route mounting, so req.path contains full path
const rawBodyPaths = [`${API_PREFIX}/webhooks/github`];

// Body parser with conditional limits
app.use((req, res, next) => {
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
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
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

app.use(express.urlencoded({ extended: false }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}
app.use(sessionMiddleware);
// i18next language detection middleware (uses Accept-Language header from frontend)
app.use(detectLanguage);
app.use(addI18nextToRequest);

// Initialize data providers and event listeners
initializeBankProviders();
initializeExchangeRateProviders();
registerAiCategorizationListeners();
registerTagReminderListeners();
registerSubscriptionMatchingListeners();

/**
 *  Routes include
 * */

// Better-auth extensions (wraps server-side only APIs like setPassword)
// Must be mounted BEFORE better-auth handler to take precedence
app.use(`${API_PREFIX}/auth`, betterAuthExtensionsRoutes);

// Demo mode route - creates temporary demo users with seeded data
// Rate limited to prevent abuse
app.use(`${API_PREFIX}/demo`, demoRoutes);

// Mount better-auth handler for all auth routes
// This handles: signup, signin, signout, session, oauth callbacks, passkey, etc.
// We wrap the handler to preserve AsyncLocalStorage context for locale-aware category creation
const authHandler = toNodeHandler(auth);
app.all(`${API_PREFIX}/auth/*`, (req: Request, res: Response) => {
  // Extract locale from Accept-Language header (same logic as detectLanguage middleware)
  const supportedLocales = SUPPORTED_LOCALES;
  const headerLang = req.headers['accept-language']?.split(',')[0]?.split('-')[0];
  const locale = headerLang && supportedLocales.includes(headerLang) ? headerLang : 'en';

  // Wrap the handler in AsyncLocalStorage context to ensure locale is available in hooks
  requestContext.run({ locale }, () => {
    authHandler(req, res);
  });
});

app.use(`${API_PREFIX}/user`, userRoutes);
app.use(`${API_PREFIX}/users`, usersRoutes);
app.use(`${API_PREFIX}/accounts`, accountsRoutes);
app.use(`${API_PREFIX}/transactions`, transactionsRoutes);
app.use(`${API_PREFIX}/categories`, categoriesRoutes);
app.use(`${API_PREFIX}/models/currencies`, modelsCurrenciesRoutes);
app.use(`${API_PREFIX}/bank-data-providers`, bankDataProvidersRoutes);
app.use(`${API_PREFIX}/crypto/binance`, binanceRoutes);
app.use(`${API_PREFIX}/stats`, statsRoutes);
app.use(`${API_PREFIX}/account-group`, accountGroupsRoutes);
app.use(`${API_PREFIX}/currencies/rates`, exchangeRatesRoutes);
app.use(`${API_PREFIX}/budgets`, budgetsRoutes);
app.use(`${API_PREFIX}/subscriptions`, subscriptionsRoutes);
app.use(`${API_PREFIX}/tags`, tagsRoutes);
app.use(`${API_PREFIX}/tag-reminders`, tagRemindersRoutes);
app.use(`${API_PREFIX}/notifications`, notificationsRoutes);
app.use(`${API_PREFIX}/investments`, investmentsRoutes);
app.use(`${API_PREFIX}/import`, csvImportExportRoutes);
app.use(`${API_PREFIX}/import`, statementParserRoutes);
app.use(`${API_PREFIX}/sse`, sseRoutes);
app.use(`${API_PREFIX}/webhooks`, webhooksRoutes);
app.use(`${API_PREFIX}/github`, githubRoutes);

if (process.env.NODE_ENV === 'test') {
  app.use(`${API_PREFIX}/tests`, testsRoutes);
}

// Sentry error handler - must be after routes but before other error handlers
// Only set up in production when Sentry is actually initialized
if (process.env.NODE_ENV === 'production') {
  Sentry.setupExpressErrorHandler(app);
}

logger.info('Attempting to start server...');

let serverInstance: https.Server | ReturnType<typeof app.listen>;

const certPath = path.join(__dirname, '../../../docker/dev/certs/cert.pem');
const keyPath = path.join(__dirname, '../../../docker/dev/certs/key.pem');
const certsExist = fs.existsSync(certPath) && fs.existsSync(keyPath);

// Use HTTPS when certs exist (dev or prod), HTTP for tests or when no certs
if (process.env.NODE_ENV !== 'test' && certsExist) {
  const httpsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };

  serverInstance = https.createServer(httpsOptions, app);
  serverInstance.listen(app.get('port'), () => {
    logger.info(`[OK] HTTPS Server is running on https://localhost:${app.get('port')}`);
    logger.info(`API Prefix: ${API_PREFIX}`);
    initializeBackgroundJobs();
  });
} else if (process.env.NODE_ENV !== 'test' && !certsExist) {
  // Non-test mode without certs - warn but allow HTTP (for CI/CD or reverse proxy setups)
  logger.warn(`SSL certificates not found at ${certPath} and ${keyPath}`);
  logger.warn('Running in HTTP mode. For HTTPS, run: cd docker/dev/certs && mkcert localhost 127.0.0.1 ::1');

  serverInstance = app.listen(app.get('port'), () => {
    logger.info(`[OK] HTTP Server is running on http://localhost:${app.get('port')}`);
    logger.info(`API Prefix: ${API_PREFIX}`);
    initializeBackgroundJobs();
  });
} else {
  // Test mode uses HTTP for simplicity
  // Cause some tests can be parallelized, the port might be in use, so we need to allow dynamic port
  serverInstance = app.listen(0, () => {
    logger.info(
      `[OK] ${String(process.env.NODE_ENV).toUpperCase()} server is running on http://localhost:${app.get('port')}`,
    );
    logger.info(`API Prefix: ${API_PREFIX}`);
    initializeBackgroundJobs();
  });
}

function initializeBackgroundJobs() {
  const isOfflineMode = process.env.OFFLINE_MODE === 'true';
  const isTestMode = process.env.NODE_ENV === 'test';

  if (isOfflineMode || isTestMode) {
    logger.info(`[${isTestMode ? 'Test' : 'Offline'} Mode] Skipping background jobs that require internet connection`);
  } else {
    // Initialize historical exchange rates on startup (non-blocking)
    initializeHistoricalRates();

    loadCurrencyRatesJob.start();

    // Demo cleanup and template refresh run in all environments (dev and prod)
    demoCleanupCron.startCron();
    demoTemplateRefreshCron.startCron();

    if (process.env.NODE_ENV === 'production') {
      securitiesDailySyncCron.startCron();
      tagRemindersCron.startCron();
      subscriptionCandidateDetectionCron.startCron();
    }
  }
}

export { serverInstance };

serverInstance.on('error', (error) => {
  console.error('Server failed to start:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const processUnexpectedExit = async () => {
  demoCleanupCron.stopCron();
  demoTemplateRefreshCron.stopCron();
  securitiesDailySyncCron.stopCron();
  tagRemindersCron.stopCron();
  subscriptionCandidateDetectionCron.stopCron();
  loadCurrencyRatesJob.stop();
  // Flush remaining PostHog events before exit
  await shutdownPostHog();
  process.exit(0);
};

process.on('SIGINT', () => {
  console.log('Received SIGINT, stopping cron jobs...');
  processUnexpectedExit();
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, stopping cron jobs...');
  processUnexpectedExit();
});
