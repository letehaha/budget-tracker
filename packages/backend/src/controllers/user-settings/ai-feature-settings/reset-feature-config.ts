import { AI_FEATURE, getProviderFromModelId } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { getDefaultModelForFeature, getModelInfo } from '@services/ai';
import { hasAiApiKey } from '@services/user-settings/ai-api-key';
import { setFeatureConfig } from '@services/user-settings/ai-feature-settings';
import { z } from 'zod';

const schema = z.object({
  params: z.object({
    feature: z.nativeEnum(AI_FEATURE),
  }),
});

export const resetFeatureConfigController = createController(schema, async ({ user, params }) => {
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
