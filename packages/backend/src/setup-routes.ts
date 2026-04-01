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

  // OAuth Protected Resource Metadata (RFC 9728)
  // MCP clients discover the authorization server via this endpoint.
  // Claude.ai fetches the path-aware form first, then falls back to root.
  const protectedResourceHandler = (_req: Request, res: Response) => {
    const baseURL = process.env.BETTER_AUTH_URL || 'https://localhost:8081';

    res.json({
      resource: `${baseURL}${API_PREFIX}/mcp`,
      authorization_servers: [baseURL],
      scopes_supported: ['finance:read', 'profile:read', 'offline_access'],
      bearer_methods_supported: ['header'],
    });
  };

  // Path-aware form (RFC 9728 Section 3.1) — Claude.ai tries this first
  app.get(`/.well-known/oauth-protected-resource${API_PREFIX}/mcp`, protectedResourceHandler);
  // Root form — fallback
  app.get('/.well-known/oauth-protected-resource', protectedResourceHandler);

  // OAuth Authorization Server Metadata (RFC 8414)
  // MCP clients discover OAuth endpoints via /.well-known/oauth-authorization-server
  // We serve this at the root level since MCP clients look for it on the server's origin
  app.get('/.well-known/oauth-authorization-server', (_req: Request, res: Response) => {
    const baseURL = process.env.BETTER_AUTH_URL || 'https://localhost:8081';
    const authPath = `${baseURL}${API_PREFIX}/auth`;

    res.json({
      issuer: baseURL,
      authorization_endpoint: `${authPath}/oauth2/authorize`,
      token_endpoint: `${authPath}/oauth2/token`,
      registration_endpoint: `${authPath}/oauth2/register`,
      revocation_endpoint: `${authPath}/oauth2/revoke`,
      introspection_endpoint: `${authPath}/oauth2/introspect`,
      jwks_uri: `${authPath}/.well-known/jwks.json`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['finance:read', 'profile:read', 'offline_access'],
    });
  });

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
