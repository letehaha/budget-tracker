import { AI_FEATURE, getProviderFromModelId } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { ValidationError } from '@js/errors';
import { getModelInfo, isValidModelId } from '@services/ai';
import { hasAiApiKey } from '@services/user-settings/ai-api-key';
import { setFeatureConfig } from '@services/user-settings/ai-feature-settings';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    feature: z.nativeEnum(AI_FEATURE),
  }),
  body: z.object({
    modelId: z.string().min(1).max(256),
  }),
});

export const setFeatureConfigController = createController(schema, async ({ user, params, body }) => {
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
