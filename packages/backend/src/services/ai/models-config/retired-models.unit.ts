// Guards the RETIRED_MODELS mapping data itself, not just the resolveLiveModelId
// mechanism. Expected targets below are a second, hand-written source of truth,
// so a swapped/wrong target fails here even though the resolver logic is untouched.

import { AI_FEATURE } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';

import { getDefaultModelForFeature, getModelInfo, isValidModelId, resolveLiveModelId } from './index';
import { RETIRED_MODELS } from './retired-models';

// Independent restatement of packages/backend/src/services/ai/models-config/retired-models.ts.
// Do NOT derive this from RETIRED_MODELS - deriving it would make the test pass for any mapping.
const EXPECTED_RETIRED_MODEL_TARGETS: Record<string, string> = {
  'openai/gpt-4o': 'openai/gpt-5.6-terra',
  'openai/gpt-4-turbo': 'openai/gpt-5.6-terra',
  'openai/gpt-4o-mini': 'openai/gpt-5.4-nano',

  'anthropic/claude-3-5-haiku-latest': 'anthropic/claude-haiku-4-5',
  'anthropic/claude-3-7-sonnet-latest': 'anthropic/claude-sonnet-5',
  'anthropic/claude-opus-4-5': 'anthropic/claude-opus-5',
  'anthropic/claude-sonnet-4-5': 'anthropic/claude-sonnet-5',

  'google/gemini-3-pro-preview': 'google/gemini-3.1-pro-preview',
  'google/gemini-3-flash-preview': 'google/gemini-3.6-flash',
  'google/gemini-2.5-pro': 'google/gemini-3.1-pro-preview',
  'google/gemini-2.5-flash': 'google/gemini-3.6-flash',
  'google/gemini-2.5-flash-lite': 'google/gemini-3.5-flash-lite',

  'groq/mixtral-8x7b-32768': 'groq/openai/gpt-oss-20b',
  'groq/llama-3.1-8b-instant': 'groq/openai/gpt-oss-20b',
};

describe('RETIRED_MODELS mapping', () => {
  it('has exactly the keys this suite expects (catches an entry added/removed without updating this table)', () => {
    expect(Object.keys(RETIRED_MODELS).sort()).toEqual(Object.keys(EXPECTED_RETIRED_MODEL_TARGETS).sort());
  });

  it.each(Object.entries(EXPECTED_RETIRED_MODEL_TARGETS))('resolves %s to %s', (retiredId, expectedLiveId) => {
    expect(resolveLiveModelId({ modelId: retiredId, feature: AI_FEATURE.categorization })).toBe(expectedLiveId);
  });

  it.each(Object.entries(RETIRED_MODELS))('value for key %s is a currently-live model', (_retiredId, liveModelId) => {
    expect(isValidModelId({ modelId: liveModelId })).toBe(true);
    expect(getModelInfo({ modelId: liveModelId })).not.toBeNull();
  });

  it.each(Object.keys(RETIRED_MODELS))('key %s is not itself a live model ID', (retiredId) => {
    expect(isValidModelId({ modelId: retiredId })).toBe(false);
  });
});

describe('resolveLiveModelId fallback behavior', () => {
  it.each(Object.values(AI_FEATURE))(
    'falls back to the feature default for a completely unknown model ID (feature: %s)',
    (feature) => {
      const result = resolveLiveModelId({ modelId: 'totally/unknown-model-id', feature });
      expect(result).toBe(getDefaultModelForFeature({ feature }));
    },
  );

  it('returns an already-live model ID unchanged', () => {
    const liveId = 'openai/gpt-5.6-sol';
    expect(resolveLiveModelId({ modelId: liveId, feature: AI_FEATURE.categorization })).toBe(liveId);
  });
});
