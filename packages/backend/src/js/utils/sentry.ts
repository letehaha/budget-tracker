import * as Sentry from '@sentry/node';

const SENTRY_DSN = process.env.SENTRY_DSN;

/**
 * Check if Sentry should be enabled.
 * Only enabled in production with valid DSN.
 */
export function isSentryEnabled(): boolean {
  const isProduction = process.env.NODE_ENV === 'production';
  const hasDsn = Boolean(SENTRY_DSN);

  return isProduction && hasDsn;
}

/**
 * Initialize Sentry error tracking.
 * Should be called very early in app initialization (in bootstrap.ts).
 */
export function initSentry(): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    release: process.env.SENTRY_RELEASE,
    environment: process.env.NODE_ENV,
    // Performance monitoring sample rate (10% of transactions)
    tracesSampleRate: 0.1,
    // Profile 10% of sampled transactions
    profilesSampleRate: 0.1,
    // Integrations
    integrations: [
      // HTTP integration for tracing requests
      Sentry.httpIntegration(),
      // Express integration
      Sentry.expressIntegration(),
    ],
    // Filter out noisy errors
    ignoreErrors: [
      // Network errors that are expected
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      // Client disconnects
      'EPIPE',
      'ENOTFOUND',
    ],
    // Before sending, add extra context
    beforeSend(event, hint) {
      // Don't send in non-production
      if (process.env.NODE_ENV !== 'production') {
        console.error('[Sentry Debug]', hint.originalException);
        return null;
      }
      return event;
    },
  });
}

/**
 * Set user context for error tracking.
 * Call this in authentication middleware.
 */
export function setSentryUser({
  userId,
  email,
  username,
  sessionId,
}: {
  userId: string | number;
  email?: string;
  username?: string;
  sessionId?: string | null;
}): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.setUser({
    id: String(userId),
    email,
    username,
  });

  // Add sessionId as a tag for easier filtering
  if (sessionId) {
    Sentry.setTag('sessionId', sessionId);
  }
}

/**
 * Clear user context (call on logout or request end).
 */
export function clearSentryUser(): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.setUser(null);
}

/**
 * Capture an exception manually.
 * @public
 */
export function captureException({
  error,
  context,
  user,
}: {
  error: Error | unknown;
  context?: Record<string, unknown>;
  user?: { id: string | number; email?: string; username?: string };
}): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    if (user) {
      scope.setUser({
        id: String(user.id),
        email: user.email,
        username: user.username,
      });
    }
    Sentry.captureException(error);
  });
}

/**
 * Add breadcrumb for debugging context.
 * @public
 */
export function addBreadcrumb({
  category,
  message,
  level,
  data,
}: {
  category: string;
  message: string;
  level?: 'debug' | 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.addBreadcrumb({
    category,
    message,
    level: level || 'info',
    data,
  });
}

export { Sentry };
