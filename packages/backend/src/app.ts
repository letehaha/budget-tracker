import './bootstrap';

import { logger } from '@js/utils/logger';
import { requestIdMiddleware } from '@middlewares/request-id';
import { sessionMiddleware } from '@middlewares/session-id';
import cors from 'cors';
import express from 'express';
import locale from 'locale';
import morgan from 'morgan';
import passport from 'passport';

import { API_PREFIX } from './config';
import { loadCurrencyRatesJob } from './crons/exchange-rates';
import { securitiesSyncCron } from './crons/sync-securities';
import { securitiesPricesSyncCron } from './crons/sync-securities-prices';
import middlewarePassword from './middlewares/passport';
import './redis-client';
import accountGroupsRoutes from './routes/account-groups';
import accountsRoutes from './routes/accounts.route';
/**
 *  Routes
 * */
import authRoutes from './routes/auth.route';
import monobankRoutes from './routes/banks/monobank.route';
import budgetsRoutes from './routes/budgets.route';
import categoriesRoutes from './routes/categories.route';
import binanceRoutes from './routes/crypto/binance.route';
import modelsCurrenciesRoutes from './routes/currencies.route';
import exchangeRatesRoutes from './routes/exchange-rates';
import investmentsRoutes from './routes/investments.route';
import statsRoutes from './routes/stats.route';
import testsRoutes from './routes/tests.route';
import transactionsRoutes from './routes/transactions.route';
import userRoutes from './routes/user.route';
import usersRoutes from './routes/users.route';
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

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}
app.use(locale(supportedLocales));
app.use(sessionMiddleware);

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
app.use(`${API_PREFIX}/banks/monobank`, monobankRoutes);
app.use(`${API_PREFIX}/crypto/binance`, binanceRoutes);
app.use(`${API_PREFIX}/stats`, statsRoutes);
app.use(`${API_PREFIX}/account-group`, accountGroupsRoutes);
app.use(`${API_PREFIX}/currencies/rates`, exchangeRatesRoutes);
app.use(`${API_PREFIX}/budgets`, budgetsRoutes);
app.use(`${API_PREFIX}/investments`, investmentsRoutes);

if (process.env.NODE_ENV === 'test') {
  app.use(`${API_PREFIX}/tests`, testsRoutes);
}

logger.info('Attempting to start server...');

// Cause some tests can be parallelized, the port might be in use, so we need to allow dynamic port
export const serverInstance = app.listen(process.env.NODE_ENV === 'test' ? 0 : app.get('port'), () => {
  logger.info(`[OK] Server is running on localhost:${app.get('port')}`);
  logger.info(`API Prefix: ${API_PREFIX}`);

  loadCurrencyRatesJob.start();

  if (process.env.NODE_ENV === 'production') {
    securitiesSyncCron.startCron();
    securitiesPricesSyncCron.startCron();
  }
});

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
  securitiesSyncCron.stopCron();
  securitiesPricesSyncCron.stopCron();
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
