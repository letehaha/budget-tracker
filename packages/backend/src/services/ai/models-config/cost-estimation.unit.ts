// Pins the "unknown vs free" split: null means the cost cannot be known, 0 is a real
// computed price. A regression to 0 shows the user a fabricated "$0.00".

import { describe, expect, it } from '@jest/globals';

import { estimateModelCostUsd, getModelCostProfile } from './index';

describe('estimateModelCostUsd', () => {
  it('returns null for a custom-endpoint model', () => {
    const profile = getModelCostProfile({ modelId: 'custom/llama-3.3-70b' });
    expect(profile).not.toBeNull();
    expect(estimateModelCostUsd({ profile: profile!, inputTokens: 10_000, outputTokens: 2_000 })).toBeNull();
  });

  it('returns null, not 0, for a catalog model without pricing', () => {
    const profile = {
      isCustom: false as const,
      name: 'Unpriced Model',
      contextWindow: 128_000,
      pricing: null,
    };
    expect(estimateModelCostUsd({ profile, inputTokens: 10_000, outputTokens: 2_000 })).toBeNull();
  });

  it('computes a real price for a priced catalog model', () => {
    const profile = {
      isCustom: false as const,
      name: 'Priced Model',
      contextWindow: 128_000,
      pricing: { inputPerMillion: 2, outputPerMillion: 10 },
    };
    // 10k input @ $2/M = $0.02; 2k output @ $10/M = $0.02
    expect(estimateModelCostUsd({ profile, inputTokens: 10_000, outputTokens: 2_000 })).toBeCloseTo(0.04);
  });

  it('returns 0 for explicit zero pricing (genuinely free model)', () => {
    const profile = {
      isCustom: false as const,
      name: 'Free Model',
      contextWindow: 128_000,
      pricing: { inputPerMillion: 0, outputPerMillion: 0 },
    };
    expect(estimateModelCostUsd({ profile, inputTokens: 10_000, outputTokens: 2_000 })).toBe(0);
  });
});
