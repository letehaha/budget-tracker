/** Cap on the free-text field. PostHog keeps event properties small, and nothing reads past this. */
export const MAX_FEEDBACK_MESSAGE_LENGTH = 1000;

export type FeedbackType = 'bug' | 'feature_request' | 'other';

export interface FeedbackSubmission {
  feedback_type: FeedbackType;
  message: string;
}

/**
 * Turns raw dialog input into the analytics payload, or `null` when there is
 * nothing worth sending.
 *
 * Whitespace-only input counts as empty: it reaches PostHog as a real
 * submission otherwise, and a feedback stream full of blank rows is worse than
 * no feedback stream.
 */
export function buildFeedbackSubmission({
  message,
  feedbackType,
}: {
  message: string;
  feedbackType: FeedbackType | null;
}): FeedbackSubmission | null {
  const trimmed = message.trim();

  if (!trimmed || !feedbackType) return null;

  return {
    feedback_type: feedbackType,
    message: trimmed.slice(0, MAX_FEEDBACK_MESSAGE_LENGTH),
  };
}
