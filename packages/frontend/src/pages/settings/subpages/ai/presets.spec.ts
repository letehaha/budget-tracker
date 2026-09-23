import { AI_PROVIDER } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { findPresetForConnection, matchPresetByBaseUrl } from './presets';

describe('matchPresetByBaseUrl', () => {
  it('matches a preset base URL exactly', () => {
    expect(matchPresetByBaseUrl({ baseUrl: 'https://openrouter.ai/api/v1' })?.id).toBe('openrouter');
  });

  it('ignores case, surrounding spaces and trailing slashes', () => {
    expect(matchPresetByBaseUrl({ baseUrl: '  HTTPS://OpenRouter.ai/api/v1//  ' })?.id).toBe('openrouter');
  });

  it('treats 127.0.0.1 and localhost as the same host', () => {
    expect(matchPresetByBaseUrl({ baseUrl: 'http://127.0.0.1:11434/v1' })?.id).toBe('ollama');
    expect(matchPresetByBaseUrl({ baseUrl: 'http://localhost:1234/v1/' })?.id).toBe('lmStudio');
  });

  it('returns null for a URL no preset uses', () => {
    expect(matchPresetByBaseUrl({ baseUrl: 'http://localhost:8000/v1' })).toBeNull();
    expect(matchPresetByBaseUrl({ baseUrl: 'https://api.groq.com/openai/v1' })).toBeNull();
  });
});

describe('findPresetForConnection', () => {
  it('maps a native connection to its provider preset', () => {
    expect(findPresetForConnection({ connection: { provider: AI_PROVIDER.anthropic } }).id).toBe('anthropic');
    expect(findPresetForConnection({ connection: { provider: AI_PROVIDER.google } }).id).toBe('google');
    expect(findPresetForConnection({ connection: { provider: AI_PROVIDER.openai } }).id).toBe('openai');
  });

  it('maps a custom connection to the quick-fill preset of its base URL', () => {
    expect(
      findPresetForConnection({ connection: { provider: AI_PROVIDER.custom, baseUrl: 'http://127.0.0.1:1234/v1' } }).id,
    ).toBe('lmStudio');
  });

  it('falls back to the generic custom preset', () => {
    expect(
      findPresetForConnection({
        connection: { provider: AI_PROVIDER.custom, baseUrl: 'https://api.groq.com/openai/v1' },
      }).id,
    ).toBe('custom');
    expect(findPresetForConnection({ connection: { provider: AI_PROVIDER.custom } }).id).toBe('custom');
  });
});
