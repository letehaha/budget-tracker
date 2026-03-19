import './bootstrap';
import './redis-client';

import { logger } from '@js/utils/logger';
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

process.on('SIGINT', () => {
  console.log('Received SIGINT, stopping cron jobs...');
  shutdownBackgroundJobs().then(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, stopping cron jobs...');
  shutdownBackgroundJobs().then(() => process.exit(0));
});
