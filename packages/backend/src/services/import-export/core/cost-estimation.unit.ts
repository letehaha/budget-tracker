// Pins the "unknown vs free" split: null means the cost cannot be known, 0 is a real
// computed price. A regression to 0 shows the user a fabricated "$0.00".

import { describe, expect, it } from '@jest/globals';
import type { ModelProfile } from '@services/ai/model-catalog';

import { estimateModelCostUsd, resolveTokenLimit } from './cost-estimation';

const profile = ({ pricing = null, contextWindow = null }: Partial<ModelProfile>): ModelProfile => ({
  name: 'Some Model',
  pricing,
  contextWindow,
  capabilities: null,
});

describe('estimateModelCostUsd', () => {
  it('returns null, not 0, for a model without a known price', () => {
    expect(estimateModelCostUsd({ profile: profile({}), inputTokens: 10_000, outputTokens: 2_000 })).toBeNull();
  });

  it('computes a real price for a priced model', () => {
    // 10k input @ $2/M = $0.02; 2k output @ $10/M = $0.02
    const priced = profile({ pricing: { inputPerMillion: 2, outputPerMillion: 10 } });
    expect(estimateModelCostUsd({ profile: priced, inputTokens: 10_000, outputTokens: 2_000 })).toBeCloseTo(0.04);
  });

  it('returns 0 for explicit zero pricing (genuinely free model)', () => {
    const free = profile({ pricing: { inputPerMillion: 0, outputPerMillion: 0 } });
    expect(estimateModelCostUsd({ profile: free, inputTokens: 10_000, outputTokens: 2_000 })).toBe(0);
  });
});

describe('resolveTokenLimit', () => {
  it('passes any input when the context window is unknown', () => {
    expect(resolveTokenLimit({ modelProfile: profile({}), estimatedInputTokens: 10_000_000 })).toEqual({
      exceeded: false,
    });
  });

  it('caps input at a third of a known context window', () => {
    const modelProfile = profile({ contextWindow: 30_000 });
    expect(resolveTokenLimit({ modelProfile, estimatedInputTokens: 10_000 })).toEqual({ exceeded: false });
    expect(resolveTokenLimit({ modelProfile, estimatedInputTokens: 10_001 })).toMatchObject({
      exceeded: true,
      maxInputTokens: 10_000,
    });
  });
});
