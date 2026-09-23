// Guards the provider/model split contract: everything before the first slash is the
// provider, everything after is passed to the SDK verbatim. OpenRouter model names carry a
// slash of their own, so a naive split('/')[1] silently truncates them and breaks every call.

import { getModelNameFromModelId } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';

describe('getModelNameFromModelId', () => {
  it('keeps the second slash of an OpenRouter-style custom model', () => {
    expect(getModelNameFromModelId({ modelId: 'custom/anthropic/claude-sonnet-5' })).toBe('anthropic/claude-sonnet-5');
  });

  it('keeps every later slash', () => {
    expect(getModelNameFromModelId({ modelId: 'custom/meta-llama/llama-3.3-70b/free' })).toBe(
      'meta-llama/llama-3.3-70b/free',
    );
  });

  it('strips only the provider segment for a single-slash ID', () => {
    expect(getModelNameFromModelId({ modelId: 'google/gemini-3.8-flash' })).toBe('gemini-3.8-flash');
  });
});
