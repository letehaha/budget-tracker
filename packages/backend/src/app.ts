import './bootstrap';
import './redis-client';

import { logger } from '@js/utils/logger';
import { Sentry } from '@js/utils/sentry';
import express from 'express';
import fs from 'fs';
import https from 'https';
import path from 'path';

import { initializeBackgroundJobs, shutdownBackgroundJobs } from './background-jobs';
import { API_PREFIX } from './config';
import { registerAiCategorizationListeners } from './services/ai-categorization';
import { initializeBankProviders } from './services/bank-data-providers/initialize-providers';
import { initializeExchangeRateProviders } from './services/exchange-rates/providers';
import { registerSubscriptionMatchingListeners } from './services/subscriptions';
import { registerTagReminderListeners } from './services/tag-reminders';
import { setupMiddleware } from './setup-middleware';
import { setupRoutes } from './setup-routes';

logger.info('Starting application initialization...');

export const app = express();

// Authentication is now handled by better-auth (session-based)
// The better-auth handler is mounted at /api/v1/auth/* below

setupMiddleware(app);

// Initialize data providers and event listeners
initializeBankProviders();
initializeExchangeRateProviders();
registerAiCategorizationListeners();
registerTagReminderListeners();
registerSubscriptionMatchingListeners();

setupRoutes(app);

logger.info('Attempting to start server...');

let serverInstance: https.Server | ReturnType<typeof app.listen>;

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const onServerReady = ({ protocol }: { protocol: 'http' | 'https' }) => {
  const port = app.get('port') as number;
  logger.info(`[OK] ${protocol.toUpperCase()} Server is running on ${protocol}://localhost:${port}`);
  logger.info(`API Prefix: ${API_PREFIX}`);
  initializeBackgroundJobs();
};

if (isTest) {
  // Test mode: HTTP on a random port to avoid conflicts with parallel runs
  serverInstance = app.listen(0, () => {
    // Store the actual OS-assigned port so self-proxy (e.g. registration patch) can reach it
    const addr = serverInstance.address();
    if (typeof addr === 'object' && addr) {
      app.set('port', addr.port);
    }
    onServerReady({ protocol: 'http' });
  });
} else if (isProduction) {
  // Production: always HTTP — TLS is terminated by the reverse proxy (Traefik)
  serverInstance = app.listen(app.get('port'), () => onServerReady({ protocol: 'http' }));
} else {
  // Dev: use HTTPS if local certs exist, otherwise fall back to HTTP
  const certPath = path.join(__dirname, '../../../docker/dev/certs/cert.pem');
  const keyPath = path.join(__dirname, '../../../docker/dev/certs/key.pem');
  const certsExist = fs.existsSync(certPath) && fs.existsSync(keyPath);

  if (certsExist) {
    const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };

    serverInstance = https.createServer(httpsOptions, app);
    serverInstance.listen(app.get('port'), () => onServerReady({ protocol: 'https' }));
  } else {
    logger.info(`SSL certificates not found at ${certPath} and ${keyPath}`);
    logger.info('Running in HTTP mode. For HTTPS, run: cd docker/dev/certs && mkcert localhost 127.0.0.1 ::1');

    serverInstance = app.listen(app.get('port'), () => onServerReady({ protocol: 'http' }));
  }
}

export { serverInstance };

serverInstance.on('error', (error) => {
  logger.error(error);
});

process.on('uncaughtException', (error) => {
  logger.error(error);
  // Flush pending Sentry events before exiting
  Sentry.close(2000).then(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  logger.error({
    message: 'Unhandled Rejection',
    error: reason instanceof Error ? reason : new Error(String(reason)),
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, stopping cron jobs...');
  shutdownBackgroundJobs().then(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, stopping cron jobs...');
  shutdownBackgroundJobs().then(() => process.exit(0));
});
