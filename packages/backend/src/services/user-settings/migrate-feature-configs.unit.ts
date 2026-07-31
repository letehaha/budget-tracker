// These rewrites happen behind the user's back when a key or an endpoint is
// removed, so a mistake either silently moves a feature onto a model the user
// never picked or throws away a config that was still valid.

import { AIFeatureConfig, AI_FEATURE, AI_MODEL_ID, AI_PROVIDER } from '@bt/shared/types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { logger } from '@js/utils/logger';

import {
  migrateFeatureConfigsOnCustomEndpointRemoval,
  migrateFeatureConfigsOnProviderRemoval,
} from './migrate-feature-configs';

const REMOVED_ENDPOINT_ID = 'endpoint-being-removed';

function customConfig({
  feature,
  customEndpointId,
  modelName = 'llama3.2',
}: {
  feature: AI_FEATURE;
  customEndpointId: string;
  modelName?: string;
}): AIFeatureConfig {
  return { feature, modelId: `custom/${modelName}`, customEndpointId };
}

const loggerInfoSpy = jest.spyOn(logger, 'info');

beforeEach(() => {
  loggerInfoSpy.mockReset();
});

describe('migrateFeatureConfigsOnCustomEndpointRemoval', () => {
  it('remaps a config on the removed endpoint to a model a remaining provider serves', () => {
    const configs = [customConfig({ feature: AI_FEATURE.categorization, customEndpointId: REMOVED_ENDPOINT_ID })];

    const result = migrateFeatureConfigsOnCustomEndpointRemoval({
      featureConfigs: configs,
      removedEndpointId: REMOVED_ENDPOINT_ID,
      remainingProviders: [AI_PROVIDER.openai],
    });

    expect(result).toEqual([{ feature: AI_FEATURE.categorization, modelId: AI_MODEL_ID['openai/gpt-5.4-nano'] }]);
    // The replacement is a catalog model, so the link to the gone endpoint must not survive
    expect(result[0]).not.toHaveProperty('customEndpointId');
  });

  it('drops the config when no remaining provider serves a recommended model', () => {
    const configs = [customConfig({ feature: AI_FEATURE.categorization, customEndpointId: REMOVED_ENDPOINT_ID })];

    const result = migrateFeatureConfigsOnCustomEndpointRemoval({
      featureConfigs: configs,
      removedEndpointId: REMOVED_ENDPOINT_ID,
      remainingProviders: [],
    });

    expect(result).toEqual([]);
  });

  it('leaves configs on the user other endpoints and on catalog models untouched', () => {
    const kept = customConfig({ feature: AI_FEATURE.statementParsing, customEndpointId: 'another-endpoint' });
    const catalog: AIFeatureConfig = {
      feature: AI_FEATURE.investmentTransactionsParsing,
      modelId: AI_MODEL_ID['openai/gpt-5.6-terra'],
    };
    const configs = [
      customConfig({ feature: AI_FEATURE.categorization, customEndpointId: REMOVED_ENDPOINT_ID }),
      kept,
      catalog,
    ];

    const result = migrateFeatureConfigsOnCustomEndpointRemoval({
      featureConfigs: configs,
      removedEndpointId: REMOVED_ENDPOINT_ID,
      remainingProviders: [AI_PROVIDER.google],
    });

    expect(result).toEqual([
      { feature: AI_FEATURE.categorization, modelId: AI_MODEL_ID['google/gemma-4-31b-it'] },
      kept,
      catalog,
    ]);
  });

  it('returns the configs untouched when nothing references the removed endpoint', () => {
    const configs = [
      customConfig({ feature: AI_FEATURE.categorization, customEndpointId: 'another-endpoint' }),
      { feature: AI_FEATURE.statementParsing, modelId: AI_MODEL_ID['google/gemini-3.6-flash'] },
    ];

    const result = migrateFeatureConfigsOnCustomEndpointRemoval({
      featureConfigs: configs,
      removedEndpointId: REMOVED_ENDPOINT_ID,
      remainingProviders: [AI_PROVIDER.google],
    });

    expect(result).toEqual(configs);
    expect(loggerInfoSpy).not.toHaveBeenCalled();
  });

  it('logs what each rewritten config moved from and to', () => {
    migrateFeatureConfigsOnCustomEndpointRemoval({
      featureConfigs: [customConfig({ feature: AI_FEATURE.categorization, customEndpointId: REMOVED_ENDPOINT_ID })],
      removedEndpointId: REMOVED_ENDPOINT_ID,
      remainingProviders: [AI_PROVIDER.openai],
    });

    expect(loggerInfoSpy).toHaveBeenCalledTimes(1);
    expect(loggerInfoSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        trigger: 'customEndpointRemoved',
        feature: AI_FEATURE.categorization,
        previousModelId: 'custom/llama3.2',
        newModelId: AI_MODEL_ID['openai/gpt-5.4-nano'],
      }),
    );
  });
});

describe('migrateFeatureConfigsOnProviderRemoval', () => {
  it('remaps a config on the removed provider to a model a remaining provider serves', () => {
    const configs: AIFeatureConfig[] = [
      { feature: AI_FEATURE.categorization, modelId: AI_MODEL_ID['openai/gpt-5.4-nano'] },
    ];

    const result = migrateFeatureConfigsOnProviderRemoval({
      featureConfigs: configs,
      removedProvider: AI_PROVIDER.openai,
      remainingProviders: [AI_PROVIDER.anthropic],
    });

    expect(result).toEqual([
      { feature: AI_FEATURE.categorization, modelId: AI_MODEL_ID['anthropic/claude-haiku-4-5'] },
    ]);
  });

  it('drops the config when no remaining provider serves a recommended model', () => {
    const configs: AIFeatureConfig[] = [
      { feature: AI_FEATURE.categorization, modelId: AI_MODEL_ID['openai/gpt-5.4-nano'] },
    ];

    const result = migrateFeatureConfigsOnProviderRemoval({
      featureConfigs: configs,
      removedProvider: AI_PROVIDER.openai,
      remainingProviders: [],
    });

    expect(result).toEqual([]);
  });

  it('leaves configs on other providers untouched', () => {
    const kept: AIFeatureConfig = {
      feature: AI_FEATURE.statementParsing,
      modelId: AI_MODEL_ID['google/gemini-3.6-flash'],
    };
    const configs: AIFeatureConfig[] = [
      { feature: AI_FEATURE.categorization, modelId: AI_MODEL_ID['openai/gpt-5.4-nano'] },
      kept,
    ];

    const result = migrateFeatureConfigsOnProviderRemoval({
      featureConfigs: configs,
      removedProvider: AI_PROVIDER.openai,
      remainingProviders: [AI_PROVIDER.google],
    });

    expect(result).toEqual([
      { feature: AI_FEATURE.categorization, modelId: AI_MODEL_ID['google/gemma-4-31b-it'] },
      kept,
    ]);
  });

  // A custom model is served by an endpoint, not by a provider key, so removing
  // a key can never invalidate it.
  it('leaves a custom-endpoint config untouched', () => {
    const configs = [customConfig({ feature: AI_FEATURE.categorization, customEndpointId: 'an-endpoint' })];

    const result = migrateFeatureConfigsOnProviderRemoval({
      featureConfigs: configs,
      removedProvider: AI_PROVIDER.openai,
      remainingProviders: [AI_PROVIDER.google],
    });

    expect(result).toEqual(configs);
  });

  it('returns the configs untouched when no config uses the removed provider', () => {
    const configs: AIFeatureConfig[] = [
      { feature: AI_FEATURE.categorization, modelId: AI_MODEL_ID['google/gemma-4-31b-it'] },
      { feature: AI_FEATURE.statementParsing, modelId: AI_MODEL_ID['google/gemini-3.6-flash'] },
    ];

    const result = migrateFeatureConfigsOnProviderRemoval({
      featureConfigs: configs,
      removedProvider: AI_PROVIDER.anthropic,
      remainingProviders: [AI_PROVIDER.google],
    });

    expect(result).toEqual(configs);
    expect(loggerInfoSpy).not.toHaveBeenCalled();
  });

  it('logs a dropped config with no replacement model', () => {
    migrateFeatureConfigsOnProviderRemoval({
      featureConfigs: [{ feature: AI_FEATURE.categorization, modelId: AI_MODEL_ID['openai/gpt-5.4-nano'] }],
      removedProvider: AI_PROVIDER.openai,
      remainingProviders: [],
    });

    expect(loggerInfoSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        trigger: 'apiKeyRemoved',
        feature: AI_FEATURE.categorization,
        previousModelId: AI_MODEL_ID['openai/gpt-5.4-nano'],
        newModelId: null,
      }),
    );
  });
});
