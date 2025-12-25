import {
  AIFeatureStatus,
  AIModelInfoWithRecommendation,
  AI_FEATURE,
  AI_PROVIDER,
  getProviderFromModelId,
} from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { ValidationError } from '@js/errors';
import {
  getAvailableModels,
  getDefaultModelForFeature,
  getModelInfo,
  isModelRecommendedForFeature,
  isValidModelId,
} from '@services/ai';
import { hasAiApiKey } from '@services/user-settings/ai-api-key';
import { getAllFeatureConfigs, getFeatureConfig, setFeatureConfig } from '@services/user-settings/ai-feature-settings';
import { z } from 'zod';

/**
 * Get all AI features status
 */
const getFeaturesStatusSchema = z.object({});

export const getFeaturesStatus = createController(getFeaturesStatusSchema, async ({ user }) => {
  const { id: userId } = user;

  const userConfigs = await getAllFeatureConfigs({ userId });
  const features: AIFeatureStatus[] = [];

  // Build status for each feature
  for (const feature of Object.values(AI_FEATURE)) {
    const userConfig = userConfigs.find((c) => c.feature === feature);
    const modelId = userConfig?.modelId ?? getDefaultModelForFeature({ feature });
    const modelInfo = getModelInfo({ modelId });
    const provider = getProviderFromModelId({ modelId });

    // Check if user has their own key for this provider
    const usingUserKey = provider ? await hasAiApiKey({ userId, provider }) : false;

    features.push({
      feature,
      isConfigured: !!userConfig,
      modelId,
      modelName: modelInfo?.name ?? modelId,
      usingUserKey,
    });
  }

  return {
    data: { features },
  };
});

/**
 * Get configuration for a specific feature
 */
const getFeatureConfigSchema = z.object({
  params: z.object({
    feature: z.nativeEnum(AI_FEATURE),
  }),
});

export const getFeatureConfigController = createController(getFeatureConfigSchema, async ({ user, params }) => {
  const { id: userId } = user;
  const { feature } = params;

  const config = await getFeatureConfig({ userId, feature });
  const modelId = config?.modelId ?? getDefaultModelForFeature({ feature });
  const modelInfo = getModelInfo({ modelId });
  const provider = getProviderFromModelId({ modelId });
  const usingUserKey = provider ? await hasAiApiKey({ userId, provider }) : false;

  return {
    data: {
      feature,
      isConfigured: !!config,
      modelId,
      modelName: modelInfo?.name ?? modelId,
      usingUserKey,
    },
  };
});

/**
 * Set model configuration for a specific feature
 */
const setFeatureConfigSchema = z.object({
  params: z.object({
    feature: z.nativeEnum(AI_FEATURE),
  }),
  body: z.object({
    modelId: z.string().min(1).max(256),
  }),
});

export const setFeatureConfigController = createController(setFeatureConfigSchema, async ({ user, params, body }) => {
  const { id: userId } = user;
  const { feature } = params;
  const { modelId } = body;

  // Validate model ID
  if (!isValidModelId({ modelId })) {
    throw new ValidationError({
      message: `Invalid model ID: ${modelId}`,
    });
  }

  await setFeatureConfig({ userId, feature, modelId });

  const modelInfo = getModelInfo({ modelId });
  const provider = getProviderFromModelId({ modelId });
  const usingUserKey = provider ? await hasAiApiKey({ userId, provider }) : false;

  return {
    data: {
      feature,
      isConfigured: true,
      modelId,
      modelName: modelInfo?.name ?? modelId,
      usingUserKey,
    },
  };
});

/**
 * Reset feature configuration to default
 */
const resetFeatureConfigSchema = z.object({
  params: z.object({
    feature: z.nativeEnum(AI_FEATURE),
  }),
});

export const resetFeatureConfigController = createController(resetFeatureConfigSchema, async ({ user, params }) => {
  const { id: userId } = user;
  const { feature } = params;

  await setFeatureConfig({ userId, feature, modelId: null });

  const modelId = getDefaultModelForFeature({ feature });
  const modelInfo = getModelInfo({ modelId });
  const provider = getProviderFromModelId({ modelId });
  const usingUserKey = provider ? await hasAiApiKey({ userId, provider }) : false;

  return {
    data: {
      feature,
      isConfigured: false,
      modelId,
      modelName: modelInfo?.name ?? modelId,
      usingUserKey,
    },
  };
});

/**
 * Get available models, optionally filtered by provider.
 * When `feature` is provided, includes `recommendedForFeature` flag.
 */
const getAvailableModelsSchema = z.object({
  query: z
    .object({
      provider: z.nativeEnum(AI_PROVIDER).optional(),
      feature: z.nativeEnum(AI_FEATURE).optional(),
    })
    .optional(),
});

export const getAvailableModelsController = createController(getAvailableModelsSchema, async ({ query }) => {
  const { provider, feature } = query ?? {};
  const baseModels = getAvailableModels({ provider });

  // Add recommendation flag if feature is specified
  const models: AIModelInfoWithRecommendation[] = baseModels.map((model) => ({
    ...model,
    recommendedForFeature: feature ? isModelRecommendedForFeature({ modelId: model.id, feature }) : undefined,
  }));

  return {
    data: { models },
  };
});
