/** Cap on the free-text field. PostHog keeps event properties small, and nothing reads past this. */
export const MAX_FEEDBACK_MESSAGE_LENGTH = 1000;

export type FeedbackType = 'bug' | 'feature_request' | 'other';

interface FeedbackSubmission {
  feedback_type: FeedbackType;
  message: string;
}

/**
 * Returns null for input not worth sending. Whitespace-only counts as empty, else it
 * reaches PostHog as a real submission and blank rows pollute the feedback stream.
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
