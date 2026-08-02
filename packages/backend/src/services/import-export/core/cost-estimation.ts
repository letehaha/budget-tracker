import { AI_FEATURE } from '@bt/shared/types';
import { describeMissingAiConfiguration, resolveAIConfiguration } from '@services/ai';
import { getModelCostProfile } from '@services/ai/models-config';

type AIConfiguration = NonNullable<Awaited<ReturnType<typeof resolveAIConfiguration>>>;
type ModelCostProfile = NonNullable<ReturnType<typeof getModelCostProfile>>;

interface EstimationPreludeError {
  code: 'NO_AI_CONFIGURED';
  message: string;
}

type EstimationPrelude =
  | { ok: true; aiConfig: AIConfiguration; modelProfile: ModelCostProfile }
  | { ok: false; error: EstimationPreludeError };

export async function resolveEstimationPrelude({
  userId,
  feature,
}: {
  userId: number;
  feature: AI_FEATURE;
}): Promise<EstimationPrelude> {
  const aiConfig = await resolveAIConfiguration({ userId, feature });

  if (!aiConfig) {
    return {
      ok: false,
      error: {
        code: 'NO_AI_CONFIGURED',
        message: await describeMissingAiConfiguration({ userId }),
      },
    };
  }

  const modelProfile = getModelCostProfile({ modelId: aiConfig.modelId });

  if (!modelProfile) {
    return {
      ok: false,
      error: {
        code: 'NO_AI_CONFIGURED',
        message: `Model ${aiConfig.modelId} not found in configuration`,
      },
    };
  }

  return { ok: true, aiConfig, modelProfile };
}

type TokenLimitVerdict =
  | { exceeded: false }
  | { exceeded: true; maxInputTokens: number; contextWindow: number; modelName: string };

/**
 * A custom endpoint declares no input limit, so the check always passes for it. Catalog
 * models get a third of the context window, leaving room for the system prompt and the
 * model's output.
 */
export function resolveTokenLimit({
  modelProfile,
  estimatedInputTokens,
}: {
  modelProfile: ModelCostProfile;
  estimatedInputTokens: number;
}): TokenLimitVerdict {
  if (modelProfile.isCustom) return { exceeded: false };

  const maxInputTokens = Math.floor(modelProfile.contextWindow / 3);

  if (estimatedInputTokens > maxInputTokens) {
    return {
      exceeded: true,
      maxInputTokens,
      contextWindow: modelProfile.contextWindow,
      modelName: modelProfile.name,
    };
  }

  return { exceeded: false };
}
