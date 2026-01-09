import { trackEvent } from '../index';

/**
 * Track AI categorization completion.
 */
export function trackAiCategorization({
  userId,
  categorizedCount,
  failedCount,
  provider,
  usingUserKey,
  sessionId,
}: {
  userId: string | number;
  categorizedCount: number;
  failedCount: number;
  provider: string;
  usingUserKey: boolean;
  sessionId?: string | null;
}): void {
  trackEvent({
    userId,
    event: 'ai_categorization_completed',
    properties: {
      categorized_count: categorizedCount,
      failed_count: failedCount,
      provider,
      using_user_key: usingUserKey,
    },
    sessionId,
  });
}
