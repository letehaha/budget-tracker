import { describe, expect, it } from '@jest/globals';
import type { LanguageModelUsage } from 'ai';

import { AI_MAX_OUTPUT_TOKENS, hitOutputCeiling } from './ai-output-limit';

function buildUsage({ outputTokens }: { outputTokens: number | undefined }): LanguageModelUsage {
  return {
    inputTokens: 1200,
    inputTokenDetails: { noCacheTokens: 1200, cacheReadTokens: 0, cacheWriteTokens: 0 },
    outputTokens,
    outputTokenDetails: { textTokens: outputTokens, reasoningTokens: 0 },
    totalTokens: 1200 + (outputTokens ?? 0),
  };
}

describe('hitOutputCeiling', () => {
  it('detects the provider reporting the cut-off itself', () => {
    expect(hitOutputCeiling({ finishReason: 'length', usage: buildUsage({ outputTokens: 4096 }) })).toBe(true);
  });

  it('treats spending the whole allowance as a cut-off even when the reason says otherwise', () => {
    // A gateway fronting another provider can truncate and still report a normal stop,
    // which is the case a finishReason-only check misses.
    expect(hitOutputCeiling({ finishReason: 'stop', usage: buildUsage({ outputTokens: AI_MAX_OUTPUT_TOKENS }) })).toBe(
      true,
    );
  });

  it('passes a reply that finished well inside the allowance', () => {
    // Normal extraction runs land in the low thousands.
    expect(hitOutputCeiling({ finishReason: 'stop', usage: buildUsage({ outputTokens: 4984 }) })).toBe(false);
  });

  it('does not accuse a response whose usage the provider omitted', () => {
    expect(hitOutputCeiling({ finishReason: 'stop', usage: undefined })).toBe(false);
    expect(hitOutputCeiling({ finishReason: 'stop', usage: buildUsage({ outputTokens: undefined }) })).toBe(false);
  });

  it('reports a cut-off on length even when usage is missing', () => {
    expect(hitOutputCeiling({ finishReason: 'length', usage: undefined })).toBe(true);
  });

  it('leaves other abnormal finishes to their own handling', () => {
    // `error` and `content-filter` are real failures, but not truncation, and the
    // callers classify them separately.
    expect(hitOutputCeiling({ finishReason: 'content-filter', usage: buildUsage({ outputTokens: 12 }) })).toBe(false);
    expect(hitOutputCeiling({ finishReason: 'error', usage: buildUsage({ outputTokens: 0 }) })).toBe(false);
  });
});
