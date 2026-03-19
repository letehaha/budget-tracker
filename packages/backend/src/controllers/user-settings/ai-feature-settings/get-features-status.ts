import { AIFeatureStatus, AI_FEATURE, getProviderFromModelId } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { getDefaultModelForFeature, getModelInfo } from '@services/ai';
import { hasAiApiKey } from '@services/user-settings/ai-api-key';
import { getAllFeatureConfigs } from '@services/user-settings/ai-feature-settings';
import { z } from 'zod';

const schema = z.object({});

export const getFeaturesStatus = createController(schema, async ({ user }) => {
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
