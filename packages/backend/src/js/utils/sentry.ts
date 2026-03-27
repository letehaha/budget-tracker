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

// --- Queue monitoring helpers ---

export interface SentryTraceData {
  sentryTrace?: string;
  sentryBaggage?: string;
}

/**
 * Wrap a queue publish (job.add) with a Sentry span.
 * The callback receives trace headers to embed in job data so the consumer
 * can link back to this producer trace.
 */
export async function withQueuePublishSpan<T>({
  queueName,
  messageId,
  payloadSize,
  fn,
}: {
  queueName: string;
  messageId: string;
  payloadSize: number;
  fn: (traceData: SentryTraceData) => Promise<T>;
}): Promise<T> {
  if (!isSentryEnabled()) {
    return fn({});
  }

  return Sentry.startSpan(
    {
      name: queueName,
      op: 'queue.publish',
      attributes: {
        'messaging.message.id': messageId,
        'messaging.destination.name': queueName,
        'messaging.message.body.size': payloadSize,
      },
    },
    async () => {
      const traceData = Sentry.getTraceData();
      return fn({
        sentryTrace: traceData['sentry-trace'],
        sentryBaggage: traceData.baggage,
      });
    },
  );
}

/**
 * Wrap a queue consumer (worker processor) with a Sentry span.
 * Links the consumer span to the producer trace via headers stored in job data.
 */
export async function withQueueProcessSpan<T>({
  queueName,
  job,
  fn,
}: {
  queueName: string;
  job: {
    id?: string | null;
    data: SentryTraceData;
    attemptsMade: number;
    timestamp: number;
  };
  fn: () => Promise<T>;
}): Promise<T> {
  if (!isSentryEnabled()) {
    return fn();
  }

  const { sentryTrace, sentryBaggage } = job.data;
  const messageSize = JSON.stringify(job.data).length;
  const receiveLatency = Date.now() - job.timestamp;

  return Sentry.continueTrace({ sentryTrace, baggage: sentryBaggage }, () => {
    return Sentry.startSpan({ name: `queue_consumer:${queueName}` }, (parent) => {
      return Sentry.startSpan(
        {
          name: queueName,
          op: 'queue.process',
          attributes: {
            'messaging.message.id': job.id || 'unknown',
            'messaging.destination.name': queueName,
            'messaging.message.body.size': messageSize,
            'messaging.message.receive.latency': receiveLatency,
            'messaging.message.retry.count': job.attemptsMade,
          },
        },
        async () => {
          try {
            const result = await fn();
            parent.setStatus({ code: 1, message: 'ok' });
            return result;
          } catch (error) {
            parent.setStatus({ code: 2, message: 'error' });
            throw error;
          }
        },
      );
    });
  });
}

export { Sentry };
