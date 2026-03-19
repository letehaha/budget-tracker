import { AIModelInfoWithRecommendation, AI_FEATURE, AI_PROVIDER } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { getAvailableModels, isModelRecommendedForFeature } from '@services/ai';
import { z } from 'zod';

const schema = z.object({
  query: z
    .object({
      provider: z.nativeEnum(AI_PROVIDER).optional(),
      feature: z.nativeEnum(AI_FEATURE).optional(),
    })
    .optional(),
});

export const getAvailableModelsController = createController(schema, async ({ query }) => {
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
