// Guards the provider/model split contract: everything before the first slash
// is the provider, everything after is passed to the SDK verbatim. Groq's
// GPT-OSS IDs carry a second slash, so a naive split('/')[1] silently
// truncates the model name and breaks every Groq call.

import { AI_MODEL_ID, AI_PROVIDER, getModelNameFromModelId } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { getProviderFromModelId } from '@services/ai/models-config';

describe('getModelNameFromModelId', () => {
  it('keeps the second slash for a two-slash Groq ID', () => {
    expect(getModelNameFromModelId({ modelId: 'groq/openai/gpt-oss-120b' })).toBe('openai/gpt-oss-120b');
  });

  it('keeps the second slash for the smaller Groq GPT-OSS variant', () => {
    expect(getModelNameFromModelId({ modelId: 'groq/openai/gpt-oss-20b' })).toBe('openai/gpt-oss-20b');
  });

  it('keeps the upstream provider segment for an OpenRouter ID', () => {
    expect(getModelNameFromModelId({ modelId: 'openrouter/openai/gpt-oss-20b' })).toBe('openai/gpt-oss-20b');
  });

  it('strips only the provider segment for a single-slash ID', () => {
    expect(getModelNameFromModelId({ modelId: 'google/gemini-3.6-flash' })).toBe('gemini-3.6-flash');
  });
});

describe('getProviderFromModelId (strict, AVAILABLE_MODELS-backed)', () => {
  it('returns "groq", not "openai", for a two-slash Groq ID', () => {
    expect(getProviderFromModelId({ modelId: 'groq/openai/gpt-oss-120b' })).toBe(AI_PROVIDER.groq);
  });

  it.each<[string, AI_PROVIDER]>([
    ['openai/gpt-5.6-sol', AI_PROVIDER.openai],
    ['anthropic/claude-opus-5', AI_PROVIDER.anthropic],
    ['google/gemini-3.6-flash', AI_PROVIDER.google],
    ['groq/llama-3.3-70b-versatile', AI_PROVIDER.groq],
    ['openrouter/openai/gpt-oss-20b', AI_PROVIDER.openrouter],
  ])('resolves %s to provider %s', (modelId, expectedProvider) => {
    expect(getProviderFromModelId({ modelId })).toBe(expectedProvider);
  });

  it('returns null for an unregistered model ID under a real provider prefix', () => {
    expect(getProviderFromModelId({ modelId: 'openai/not-a-real-model' })).toBeNull();
  });

  it('returns null for a string with no registered provider prefix', () => {
    expect(getProviderFromModelId({ modelId: 'not-a-model-id-at-all' })).toBeNull();
  });

  it.each(Object.values(AI_MODEL_ID))('assigns %s a provider whose prefix matches the ID itself', (modelId) => {
    const provider = getProviderFromModelId({ modelId });
    expect(provider).not.toBeNull();
    expect(modelId.startsWith(`${provider}/`)).toBe(true);
  });
});
