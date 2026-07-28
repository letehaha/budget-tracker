import { trackEvent } from '../index';

/**
 * Track a demo session being provisioned.
 *
 * `durationMs` covers user creation plus the template apply, which bulk-inserts the
 * full seeded dataset and rebuilds balances — the server-side counterpart to the
 * landing page's `demo_setup_succeeded`, and the only view of how long that takes.
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
