import { AI_FEATURE, getProviderFromModelId } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { ValidationError } from '@js/errors';
import { getModelInfo, isRetiredModelId, isValidModelId } from '@services/ai';
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

  // Retired aliases accepted; service upgrades + persists the live ID.
  if (!isValidModelId({ modelId }) && !isRetiredModelId({ modelId })) {
    throw new ValidationError({
      message: `Invalid model ID: ${modelId}`,
    });
  }

  const savedConfig = await setFeatureConfig({ userId, feature, modelId });
  const storedModelId = savedConfig?.modelId ?? modelId;

  const modelInfo = getModelInfo({ modelId: storedModelId });
  const provider = getProviderFromModelId({ modelId: storedModelId });
  const usingUserKey = provider ? await hasAiApiKey({ userId, provider }) : false;

  return {
    data: {
      feature,
      isConfigured: true,
      modelId: storedModelId,
      modelName: modelInfo?.name ?? storedModelId,
      usingUserKey,
    },
  };
});
