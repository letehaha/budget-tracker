import { requestContext } from '@common/request-context';
import { Sentry } from '@js/utils/sentry';
import { toNodeHandler } from 'better-auth/node';
import { Express, Request, Response } from 'express';

import { API_PREFIX } from './config';
import { auth } from './config/auth';
import { SUPPORTED_LOCALES } from './i18n';
import accountGroupsRoutes from './routes/account-groups';
import accountsRoutes from './routes/accounts.route';
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
import mcpRoutes from './routes/mcp.route';
import notificationsRoutes from './routes/notifications.route';
import { setupOAuthMetadataRoutes } from './routes/oauth-metadata.route';
import paymentRemindersRoutes from './routes/payment-reminders.route';
import sseRoutes from './routes/sse.route';
import statsRoutes from './routes/stats.route';
import subscriptionsRoutes from './routes/subscriptions.route';
import tagRemindersRoutes from './routes/tag-reminders.route';
import tagsRoutes from './routes/tags.route';
import testsRoutes from './routes/tests.route';
import transactionGroupsRoutes from './routes/transaction-groups.route';
import transactionsRoutes from './routes/transactions.route';
import userRoutes from './routes/user.route';
import usersRoutes from './routes/users.route';
import webhooksRoutes from './routes/webhooks.route';

export function setupRoutes(app: Express) {
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
  app.use(`${API_PREFIX}/transaction-groups`, transactionGroupsRoutes);
  app.use(`${API_PREFIX}/notifications`, notificationsRoutes);
  app.use(`${API_PREFIX}/payment-reminders`, paymentRemindersRoutes);
  app.use(`${API_PREFIX}/investments`, investmentsRoutes);
  app.use(`${API_PREFIX}/mcp`, mcpRoutes);
  app.use(`${API_PREFIX}/import`, csvImportExportRoutes);
  app.use(`${API_PREFIX}/import`, statementParserRoutes);
  app.use(`${API_PREFIX}/sse`, sseRoutes);
  app.use(`${API_PREFIX}/webhooks`, webhooksRoutes);
  app.use(`${API_PREFIX}/github`, githubRoutes);

  // "development" is required here: Playwright frontend e2e tests run against
  // the dev backend on CI and rely on /tests/verify-email and other test-only endpoints.
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
    app.use(`${API_PREFIX}/tests`, testsRoutes);
  }

  setupOAuthMetadataRoutes({ app });

  // Block search engine crawling on the API subdomain
  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /');
  });

  // Sentry error handler - must be after routes but before other error handlers
  // Only set up in production when Sentry is actually initialized
  if (process.env.NODE_ENV === 'production') {
    Sentry.setupExpressErrorHandler(app);
  }
}
