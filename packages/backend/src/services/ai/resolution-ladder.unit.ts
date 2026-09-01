import { AIFeatureConfig, AIKeyProvider, AI_FEATURE, AI_PROVIDER } from '@bt/shared/types';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { pickResolutionStep, type LadderEndpoint } from './resolution-ladder';

const SERVER_KEY_ENV_VARS = [
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY',
] as const;

// Its default model is a Google one, so GEMINI_API_KEY is what backs the server arm here.
const FEATURE = AI_FEATURE.categorization;

const ENDPOINT: LadderEndpoint = { id: 'ep-1', name: 'Home Ollama', defaultModel: 'llama3.2', status: 'valid' };
const SECOND_ENDPOINT: LadderEndpoint = { id: 'ep-2', name: 'Studio vLLM', defaultModel: 'qwen2.5', status: 'valid' };

const CUSTOM_CONFIG: AIFeatureConfig = { feature: FEATURE, modelId: 'custom/llama3.2', customEndpointId: ENDPOINT.id };
const ANTHROPIC_CONFIG: AIFeatureConfig = { feature: FEATURE, modelId: 'anthropic/claude-haiku-4-5' };
const OPENROUTER_CONFIG: AIFeatureConfig = {
  feature: FEATURE,
  modelId: 'openrouter/openai/gpt-oss-20b',
};

function pick({
  config = null,
  keyProviders = [],
  endpoints = [],
  excludedEndpointIds,
}: {
  config?: AIFeatureConfig | null;
  keyProviders?: AIKeyProvider[];
  endpoints?: LadderEndpoint[];
  excludedEndpointIds?: ReadonlySet<string>;
} = {}) {
  return pickResolutionStep({
    feature: FEATURE,
    config,
    keyProviders: new Set(keyProviders),
    endpoints,
    excludedEndpointIds,
  });
}

describe('pickResolutionStep', () => {
  const envBeforeTest = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const envVar of SERVER_KEY_ENV_VARS) {
      envBeforeTest.set(envVar, process.env[envVar]);
      delete process.env[envVar];
    }
  });

  afterEach(() => {
    for (const envVar of SERVER_KEY_ENV_VARS) {
      const value = envBeforeTest.get(envVar);
      if (value === undefined) delete process.env[envVar];
      else process.env[envVar] = value;
    }
  });

  describe('configured custom model', () => {
    it('picks the configured endpoint over everything else', () => {
      process.env.GEMINI_API_KEY = 'server-key';

      const step = pick({
        config: CUSTOM_CONFIG,
        keyProviders: [AI_PROVIDER.google],
        endpoints: [SECOND_ENDPOINT, ENDPOINT],
      });

      expect(step).toEqual({ kind: 'configured-custom', endpoint: ENDPOINT, modelId: 'custom/llama3.2' });
    });

    it('still picks the configured endpoint when it is flagged invalid', () => {
      const flagged = { ...ENDPOINT, status: 'invalid' as const };

      const step = pick({ config: CUSTOM_CONFIG, endpoints: [flagged] });

      expect(step.kind).toBe('configured-custom');
    });

    it('falls through to the ladder when the configured endpoint was deleted', () => {
      const step = pick({ config: CUSTOM_CONFIG, endpoints: [SECOND_ENDPOINT] });

      expect(step).toMatchObject({ kind: 'fallback-endpoint', endpoint: SECOND_ENDPOINT });
    });
  });

  describe('configured catalog model', () => {
    it('runs on the user key for the configured provider', () => {
      const step = pick({ config: ANTHROPIC_CONFIG, keyProviders: [AI_PROVIDER.anthropic] });

      expect(step).toEqual({
        kind: 'configured-catalog',
        provider: AI_PROVIDER.anthropic,
        modelId: ANTHROPIC_CONFIG.modelId,
        usingUserKey: true,
      });
    });

    it('runs on the server key when the user has none for that provider', () => {
      process.env.ANTHROPIC_API_KEY = 'server-key';

      const step = pick({ config: ANTHROPIC_CONFIG });

      expect(step).toMatchObject({ kind: 'configured-catalog', usingUserKey: false });
    });

    it('runs an OpenRouter model on the OpenRouter server key', () => {
      process.env.OPENROUTER_API_KEY = 'server-key';

      const step = pick({ config: OPENROUTER_CONFIG });

      expect(step).toEqual({
        kind: 'configured-catalog',
        provider: AI_PROVIDER.openrouter,
        modelId: OPENROUTER_CONFIG.modelId,
        usingUserKey: false,
      });
    });

    it('falls through to the endpoint fallback when no key backs the configured provider', () => {
      const step = pick({ config: ANTHROPIC_CONFIG, endpoints: [ENDPOINT] });

      expect(step).toMatchObject({ kind: 'fallback-endpoint', endpoint: ENDPOINT });
    });
  });

  describe('no usable config', () => {
    it('prefers the feature default on the user key over the user endpoints', () => {
      const step = pick({ keyProviders: [AI_PROVIDER.google], endpoints: [ENDPOINT] });

      expect(step).toMatchObject({ kind: 'default-catalog', provider: AI_PROVIDER.google, usingUserKey: true });
    });

    it('dials the first endpoint not flagged invalid', () => {
      const flagged = { ...ENDPOINT, status: 'invalid' as const };

      const step = pick({ endpoints: [flagged, SECOND_ENDPOINT] });

      expect(step).toEqual({
        kind: 'fallback-endpoint',
        endpoint: SECOND_ENDPOINT,
        modelId: 'custom/qwen2.5',
      });
    });

    it('refuses with all-endpoints-down even when a server key could answer', () => {
      process.env.GEMINI_API_KEY = 'server-key';
      const flagged = { ...ENDPOINT, status: 'invalid' as const };

      const step = pick({ endpoints: [flagged] });

      expect(step).toEqual({ kind: 'all-endpoints-down', endpoint: flagged });
    });

    it('falls back to the server key when the user has no endpoints at all', () => {
      process.env.GEMINI_API_KEY = 'server-key';

      const step = pick({});

      expect(step).toMatchObject({ kind: 'default-catalog', usingUserKey: false });
    });

    it('reports unserved when nothing anywhere can answer', () => {
      expect(pick({})).toEqual({ kind: 'unserved', reason: 'no-credentials' });
    });
  });

  describe('excluded endpoints', () => {
    it('skips an excluded endpoint in both the configured and fallback arms', () => {
      const excluded = new Set([ENDPOINT.id]);

      const configured = pick({
        config: CUSTOM_CONFIG,
        endpoints: [ENDPOINT, SECOND_ENDPOINT],
        excludedEndpointIds: excluded,
      });
      expect(configured).toMatchObject({ kind: 'fallback-endpoint', endpoint: SECOND_ENDPOINT });

      const fallback = pick({ endpoints: [ENDPOINT], excludedEndpointIds: excluded });
      expect(fallback).toEqual({ kind: 'all-endpoints-down', endpoint: ENDPOINT });
    });
  });
});
