import './bootstrap';

import { logger } from '@js/utils/logger';
import { requestIdMiddleware } from '@middlewares/request-id';
import { sessionMiddleware } from '@middlewares/session-id';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import https from 'https';
import locale from 'locale';
import morgan from 'morgan';
import passport from 'passport';
import path from 'path';

import { API_PREFIX } from './config';
import { loadCurrencyRatesJob } from './crons/exchange-rates';
import { securitiesDailySyncCron } from './crons/securities-daily-sync';
import middlewarePassword from './middlewares/passport';
import './redis-client';
import accountGroupsRoutes from './routes/account-groups';
import accountsRoutes from './routes/accounts.route';
/**
 *  Routes
 * */
import authRoutes from './routes/auth.route';
import bankDataProvidersRoutes from './routes/bank-data-providers.route';
import budgetsRoutes from './routes/budgets.route';
import categoriesRoutes from './routes/categories.route';
import binanceRoutes from './routes/crypto/binance.route';
import modelsCurrenciesRoutes from './routes/currencies.route';
import exchangeRatesRoutes from './routes/exchange-rates';
import csvImportExportRoutes from './routes/import-export/csv.route';
import investmentsRoutes from './routes/investments.route';
import statsRoutes from './routes/stats.route';
import testsRoutes from './routes/tests.route';
import transactionsRoutes from './routes/transactions.route';
import userRoutes from './routes/user.route';
import usersRoutes from './routes/users.route';
import { initializeBankProviders } from './services/bank-data-providers/initialize-providers';
import { initializeHistoricalRates } from './services/exchange-rates/initialize-historical-rates.service';
import { initializeExchangeRateProviders } from './services/exchange-rates/providers';
import { supportedLocales } from './translations';

logger.info('Starting application initialization...');

export const app = express();

app.use(passport.initialize());
middlewarePassword(passport);

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

      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    exposedHeaders: ['x-session-id', 'x-request-id'],
  }),
);

logger.info(`CORS configured with origins: ${ALLOWED_ORIGINS}`);

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
    ],
  };

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
app.use(locale(supportedLocales));
app.use(sessionMiddleware);

// Initialize data providers
initializeBankProviders();
initializeExchangeRateProviders();

/**
 *  Routes include
 * */
app.use(`${API_PREFIX}/auth`, authRoutes);
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
app.use(`${API_PREFIX}/investments`, investmentsRoutes);
app.use(`${API_PREFIX}/import`, csvImportExportRoutes);

if (process.env.NODE_ENV === 'test') {
  app.use(`${API_PREFIX}/tests`, testsRoutes);
}

logger.info('Attempting to start server...');

let serverInstance: https.Server | ReturnType<typeof app.listen>;

// Use HTTPS in development, HTTP in test mode
if (process.env.NODE_ENV === 'development') {
  const certPath = path.join(__dirname, '../../../docker/dev/certs/cert.pem');
  const keyPath = path.join(__dirname, '../../../docker/dev/certs/key.pem');

  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    logger.error(`SSL certificates not found at ${certPath} and ${keyPath}`);
    logger.error('Please run: cd docker/dev/certs && mkcert localhost 127.0.0.1 ::1');
    process.exit(1);
  }

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
} else {
  // Test mode uses HTTP for simplicity
  // Cause some tests can be parallelized, the port might be in use, so we need to allow dynamic port
  serverInstance = app.listen(process.env.NODE_ENV === 'test' ? 0 : app.get('port'), () => {
    logger.info(`[OK] Test server is running on http://localhost:${app.get('port')}`);
    logger.info(`API Prefix: ${API_PREFIX}`);
    initializeBackgroundJobs();
  });
}

function initializeBackgroundJobs() {
  const isOfflineMode = process.env.OFFLINE_MODE === 'true';

  if (isOfflineMode) {
    logger.info('[Offline Mode] Skipping background jobs that require internet connection');
  } else {
    // Initialize historical exchange rates on startup (non-blocking)
    initializeHistoricalRates();

    loadCurrencyRatesJob.start();

    if (process.env.NODE_ENV === 'production') {
      securitiesDailySyncCron.startCron();
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

const processUnexpectedExit = () => {
  securitiesDailySyncCron.stopCron();
  loadCurrencyRatesJob.stop();
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
