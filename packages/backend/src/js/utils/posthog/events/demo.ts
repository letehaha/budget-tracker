import { trackEvent } from '../index';

/**
 * Tracks demo provisioning duration. `durationMs` spans user creation through
 * template apply (seed insert + balance rebuild); no other server-side timer
 * covers that work.
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
 * Tracks a demo user refused a feature by `blockDemoUsers`, a request that
 * reached the API. Shares its event name with the frontend's
 * `demo_feature_blocked`, split by `surface`. `route` is the Express pattern
 * (`/:id/restore`), not the raw path, so events group instead of fragmenting
 * per record id.
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
