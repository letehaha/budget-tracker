import { trackEvent } from '../index';

/**
 * Track feature usage.
 */
export function trackFeatureUsage({
  userId,
  feature,
  properties,
  sessionId,
}: {
  userId: string | number;
  feature: string;
  properties?: Record<string, unknown>;
  sessionId?: string | null;
}): void {
  trackEvent({
    userId,
    event: 'feature_used',
    properties: {
      feature,
      ...properties,
    },
    sessionId,
  });
}
