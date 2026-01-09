import { PostHog } from 'posthog-node';

const POSTHOG_KEY = process.env.POSTHOG_KEY;
const POSTHOG_HOST = process.env.POSTHOG_HOST;

let posthogClient: PostHog | null = null;

/**
 * Check if PostHog should be enabled.
 * Only enabled in production with valid API key.
 */
export function isPostHogEnabled(): boolean {
  const isProduction = process.env.NODE_ENV === 'production';
  const hasKey = Boolean(POSTHOG_KEY);

  return isProduction && hasKey;
}

/**
 * Initialize PostHog client.
 * Should be called early in app initialization.
 */
export function initPostHog(): void {
  if (!isPostHogEnabled()) {
    return;
  }

  posthogClient = new PostHog(POSTHOG_KEY!, {
    host: POSTHOG_HOST || 'https://eu.i.posthog.com',
    // Flush events every 10 seconds or 20 events
    flushAt: 20,
    flushInterval: 10000,
  });
}

/**
 * Identify a user.
 * Call this when user logs in or is authenticated.
 */
export function identifyUser({
  userId,
  properties,
}: {
  userId: string | number;
  properties?: Record<string, unknown>;
}): void {
  if (!posthogClient) {
    return;
  }

  posthogClient.identify({
    distinctId: String(userId),
    properties,
  });
}

/**
 * Track a server-side event.
 * All backend events are automatically tagged with source: 'be'.
 */
export function trackEvent({
  userId,
  event,
  properties,
  sessionId,
}: {
  userId: string | number;
  event: string;
  properties?: Record<string, unknown>;
  sessionId?: string | null;
}): void {
  if (!posthogClient) {
    return;
  }

  posthogClient.capture({
    distinctId: String(userId),
    event,
    properties: {
      source: 'be',
      ...properties,
      // Include sessionId for session-based analytics
      ...(sessionId && { $session_id: sessionId }),
    },
  });
}

/**
 * Shutdown PostHog client gracefully.
 * Call this on app shutdown to flush remaining events.
 */
export async function shutdownPostHog(): Promise<void> {
  if (!posthogClient) {
    return;
  }

  await posthogClient.shutdown();
}

// Re-export all events for convenience
export * from './events';
