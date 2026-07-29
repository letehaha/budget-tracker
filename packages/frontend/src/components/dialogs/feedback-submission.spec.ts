import { describe, expect, it } from 'vitest';

import { MAX_FEEDBACK_MESSAGE_LENGTH, buildFeedbackSubmission } from './feedback-submission';

describe('buildFeedbackSubmission', () => {
  it('builds the analytics payload from valid input', () => {
    expect(buildFeedbackSubmission({ message: 'Budgets show zero', feedbackType: 'bug' })).toEqual({
      feedback_type: 'bug',
      message: 'Budgets show zero',
    });
  });

  it('trims surrounding whitespace', () => {
    expect(buildFeedbackSubmission({ message: '  spacing everywhere  ', feedbackType: 'other' })?.message).toBe(
      'spacing everywhere',
    );
  });

  it('rejects an empty message', () => {
    expect(buildFeedbackSubmission({ message: '', feedbackType: 'bug' })).toBeNull();
  });

  it('rejects a whitespace-only message, which would otherwise send a blank row', () => {
    expect(buildFeedbackSubmission({ message: '   \n\t  ', feedbackType: 'bug' })).toBeNull();
  });

  it('rejects a missing type', () => {
    expect(buildFeedbackSubmission({ message: 'Real feedback', feedbackType: null })).toBeNull();
  });

  it('truncates an overlong message to the cap', () => {
    const result = buildFeedbackSubmission({
      message: 'x'.repeat(MAX_FEEDBACK_MESSAGE_LENGTH + 500),
      feedbackType: 'feature_request',
    });

    expect(result?.message).toHaveLength(MAX_FEEDBACK_MESSAGE_LENGTH);
  });

  it('keeps a message that is exactly at the cap', () => {
    const message = 'y'.repeat(MAX_FEEDBACK_MESSAGE_LENGTH);

    expect(buildFeedbackSubmission({ message, feedbackType: 'other' })?.message).toBe(message);
  });

  it('carries each feedback type through unchanged', () => {
    for (const feedbackType of ['bug', 'feature_request', 'other'] as const) {
      expect(buildFeedbackSubmission({ message: 'note', feedbackType })?.feedback_type).toBe(feedbackType);
    }
  });
});
