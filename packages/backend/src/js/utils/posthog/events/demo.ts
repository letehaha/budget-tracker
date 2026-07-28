import { trackEvent } from '../index';

/**
 * Track a demo session being provisioned.
 *
 * `durationMs` covers user creation plus the template apply, which bulk-inserts the
 * seeded dataset and rebuilds balances. Server-side counterpart to the landing page's
 * `demo_setup_succeeded`, and the only view of how long that work takes.
 */
export function trackDemoSessionCreated({ userId, durationMs }: { userId: string | number; durationMs: number }): void {
  trackEvent({
    userId,
    event: 'demo_session_created',
    properties: {
      duration_ms: durationMs,
    },
  });
}

/**
 * Track a demo user being refused a feature by `blockDemoUsers`.
 *
 * Shares its event name with the frontend's `demo_feature_blocked`, separated by the
 * `surface` property: this one records requests that reached the API, the frontend one
 * records controls disabled before any request went out. Read together they list what
 * demo visitors try to do and cannot.
 *
 * `route` holds the Express route pattern (`/:id/restore`), so the property groups
 * instead of fragmenting on record ids.
 */
export function trackDemoFeatureBlocked({
  userId,
  method,
  route,
}: {
  userId: string | number;
  method: string;
  route: string;
}): void {
  trackEvent({
    userId,
    event: 'demo_feature_blocked',
    properties: {
      surface: 'api',
      method,
      route,
    },
  });
}
