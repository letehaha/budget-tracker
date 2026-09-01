import { AIFeatureConfig, AI_FEATURE, AI_PROVIDER } from '@bt/shared/types';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import type { StoredAiSettings } from '@models/user-settings.model';

import { getDefaultModelForFeature } from '../ai/models-config';
import { resolveFeatureModelDisplay } from './resolve-feature-model-display';

const SERVER_KEY_ENV_VARS = [
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY',
] as const;

const FEATURE = AI_FEATURE.categorization;
const DEFAULT_MODEL_ID = getDefaultModelForFeature({ feature: FEATURE });

const ENDPOINT: NonNullable<StoredAiSettings['customEndpoints']>[number] = {
  id: 'ep-1',
  name: 'Home Ollama',
  baseUrl: 'https://ollama.home.lan/v1',
  defaultModel: 'llama3.2',
  createdAt: new Date().toISOString(),
  status: 'valid',
  lastValidatedAt: new Date().toISOString(),
};

function buildAiSettings({
  keyProviders = [],
  endpoints = [],
}: {
  keyProviders?: AI_PROVIDER[];
  endpoints?: NonNullable<StoredAiSettings['customEndpoints']>;
} = {}): StoredAiSettings {
  return {
    apiKeys: keyProviders.map((provider) => ({
      provider: provider as Exclude<AI_PROVIDER, AI_PROVIDER.custom>,
      keyEncrypted: 'ciphertext',
      createdAt: new Date().toISOString(),
    })),
    featureConfigs: [],
    customEndpoints: endpoints,
  };
}

describe('resolveFeatureModelDisplay', () => {
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

  it('names the configured endpoint model with its endpoint', () => {
    const config: AIFeatureConfig = { feature: FEATURE, modelId: 'custom/llama3.2', customEndpointId: ENDPOINT.id };

    const display = resolveFeatureModelDisplay({
      feature: FEATURE,
      config,
      aiSettings: buildAiSettings({ endpoints: [ENDPOINT] }),
    });

    expect(display).toEqual({
      modelId: 'custom/llama3.2',
      modelName: 'llama3.2',
      usingUserKey: true,
      customEndpointId: ENDPOINT.id,
      endpointName: ENDPOINT.name,
    });
  });

  // A config on a keyless provider must not be shown as "your key answers model X" while the
  // run dials the default model.
  it('names the default model, not the dead configured one, when the default provider key answers', () => {
    const config: AIFeatureConfig = { feature: FEATURE, modelId: 'anthropic/claude-haiku-4-5' };

    const display = resolveFeatureModelDisplay({
      feature: FEATURE,
      config,
      aiSettings: buildAiSettings({ keyProviders: [AI_PROVIDER.google] }),
    });

    expect(display.modelId).toBe(DEFAULT_MODEL_ID);
    expect(display.usingUserKey).toBe(true);
    expect(display.customEndpointId).toBeUndefined();
  });

  it('names the fallback endpoint for a config whose provider has no key anywhere', () => {
    const config: AIFeatureConfig = { feature: FEATURE, modelId: 'anthropic/claude-haiku-4-5' };

    const display = resolveFeatureModelDisplay({
      feature: FEATURE,
      config,
      aiSettings: buildAiSettings({ endpoints: [ENDPOINT] }),
    });

    expect(display).toEqual({
      modelId: 'custom/llama3.2',
      modelName: 'llama3.2',
      usingUserKey: true,
      customEndpointId: ENDPOINT.id,
      endpointName: ENDPOINT.name,
    });
  });

  it('names the configured catalog model on the server key', () => {
    process.env.ANTHROPIC_API_KEY = 'server-key';
    const config: AIFeatureConfig = { feature: FEATURE, modelId: 'anthropic/claude-haiku-4-5' };

    const display = resolveFeatureModelDisplay({ feature: FEATURE, config, aiSettings: buildAiSettings() });

    expect(display.modelId).toBe('anthropic/claude-haiku-4-5');
    expect(display.usingUserKey).toBe(false);
  });

  // The run refuses to move to the server key while the user owns endpoints, so the
  // flagged endpoint is the only thing that could answer and the screen keeps naming it.
  it('keeps naming a flagged endpoint even when a server key exists', () => {
    process.env.ANTHROPIC_API_KEY = 'server-key';
    const flagged = { ...ENDPOINT, status: 'invalid' as const };

    const display = resolveFeatureModelDisplay({
      feature: FEATURE,
      config: null,
      aiSettings: buildAiSettings({ endpoints: [flagged] }),
    });

    expect(display).toMatchObject({
      modelId: 'custom/llama3.2',
      modelName: 'llama3.2',
      usingUserKey: true,
      customEndpointId: ENDPOINT.id,
      endpointName: ENDPOINT.name,
    });
  });

  it('keeps naming the user pick when nothing anywhere can answer', () => {
    const config: AIFeatureConfig = { feature: FEATURE, modelId: 'anthropic/claude-haiku-4-5' };

    const display = resolveFeatureModelDisplay({ feature: FEATURE, config, aiSettings: null });

    expect(display.modelId).toBe('anthropic/claude-haiku-4-5');
    expect(display.usingUserKey).toBe(false);
  });

  it('falls back to the feature default when there is no config and no credentials', () => {
    const display = resolveFeatureModelDisplay({ feature: FEATURE, config: null, aiSettings: null });

    expect(display.modelId).toBe(DEFAULT_MODEL_ID);
    expect(display.usingUserKey).toBe(false);
  });
});
