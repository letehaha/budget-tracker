import * as Sentry from '@sentry/vue';
import { makeFetchTransport } from '@sentry/vue';
import type { App } from 'vue';
import type { Router } from 'vue-router';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

/**
 * Check if Sentry should be enabled.
 * Only enabled in production with valid DSN.
 */
function isSentryEnabled(): boolean {
  const isProduction = import.meta.env.PROD;
  const hasDsn = Boolean(SENTRY_DSN);

  return isProduction && hasDsn;
}

/**
 * Custom transport that silently handles errors (e.g., when blocked by ad blockers).
 * Wraps the default fetch transport and catches any network failures.
 */
function makeSilentFetchTransport(options: Parameters<typeof makeFetchTransport>[0]) {
  const transport = makeFetchTransport(options);

  return {
    ...transport,
    send: async (envelope: Parameters<typeof transport.send>[0]) => {
      try {
        return await transport.send(envelope);
      } catch {
        // Silently ignore transport errors (likely blocked by ad blocker)
        return { statusCode: 0 };
      }
    },
  };
}

/**
 * Initialize Sentry error tracking.
 * Should be called before app.mount().
 */
export function initSentry({ app, router }: { app: App; router: Router }): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.init({
    app,
    dsn: SENTRY_DSN,
    // Use custom transport that silently handles blocked requests
    transport: makeSilentFetchTransport,
    integrations: [
      // Browser tracing for performance monitoring
      Sentry.browserTracingIntegration({ router }),
      // Replay for session recordings on errors
      Sentry.replayIntegration({
        // Mask all text for privacy
        maskAllText: true,
        // Block all media
        blockAllMedia: true,
      }),
    ],
    // Performance monitoring sample rate (10% of transactions)
    tracesSampleRate: 0.1,
    // Session replay sample rate
    // Capture 1% of all sessions
    replaysSessionSampleRate: 0.01,
    // Capture 100% of sessions with errors
    replaysOnErrorSampleRate: 1.0,
    // Environment
    environment: import.meta.env.MODE,
    // Only send errors from production domains
    allowUrls: [/https?:\/\/(www\.)?gamanets\.money/, /https?:\/\/(www\.)?moneymatter\.app/],
    // Ignore common non-actionable errors
    ignoreErrors: [
      // Network errors
      'Network request failed',
      'Failed to fetch',
      'NetworkError',
      'Load failed',
      // Browser extensions
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      // ResizeObserver (harmless)
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      // User aborted
      'AbortError',
      'The operation was aborted',
    ],
    // Before sending error, add extra context
    beforeSend(event, hint) {
      // Don't send errors in development
      if (import.meta.env.DEV) {
        console.error('[Sentry Debug]', hint.originalException || hint.syntheticException);
        return null;
      }
      return event;
    },
  });
}

/**
 * Set user context for error tracking.
 * Call this when user logs in.
 */
export function setSentryUser({
  userId,
  email,
  username,
}: {
  userId: string | number;
  email?: string;
  username?: string;
}): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.setUser({
    id: String(userId),
    email,
    username,
  });
}

/**
 * Clear user context (call on logout).
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
}: {
  error: Error | unknown;
  context?: Record<string, unknown>;
}): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.captureException(error, {
    extra: context,
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
