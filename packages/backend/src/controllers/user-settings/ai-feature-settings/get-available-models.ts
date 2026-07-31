import { AIModelInfoWithRecommendation, AI_FEATURE, AI_KEY_PROVIDERS } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { getAvailableModels, isModelRecommendedForFeature } from '@services/ai';
import { z } from 'zod';

const schema = z.object({
  query: z
    .object({
      provider: z.enum(AI_KEY_PROVIDERS).optional(),
      feature: z.nativeEnum(AI_FEATURE).optional(),
    })
    .optional(),
});

export const getAvailableModelsController = createController(schema, async ({ query }) => {
  const { provider, feature } = query ?? {};
  const baseModels = getAvailableModels({ provider });

  const models: AIModelInfoWithRecommendation[] = baseModels.map((model) => ({
    ...model,
    recommendedForFeature: feature ? isModelRecommendedForFeature({ modelId: model.id, feature }) : undefined,
  }));

  return {
    data: { models },
  };
});
