import { AI_FEATURE } from '@bt/shared/types';
import { logger } from '@js/utils';
import { describeMissingAiConfiguration, resolveAIConfiguration } from '@services/ai';
import { type ModelProfile, getModelProfile } from '@services/ai/model-catalog';

type AIConfiguration = NonNullable<Awaited<ReturnType<typeof resolveAIConfiguration>>>;

interface EstimationPreludeError {
  code: 'NO_AI_CONFIGURED';
  message: string;
}

type EstimationPrelude =
  | { ok: true; aiConfig: AIConfiguration; modelProfile: ModelProfile }
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
    logger.info('Cost estimation prelude failed', {
      code: 'NO_AI_CONFIGURED',
      reason: 'no-ai-config',
      userId,
      feature,
    });

    return {
      ok: false,
      error: {
        code: 'NO_AI_CONFIGURED',
        message: await describeMissingAiConfiguration({ userId }),
      },
    };
  }

  const modelProfile = await getModelProfile(aiConfig);

  return { ok: true, aiConfig, modelProfile };
}

type TokenLimitVerdict =
  | { exceeded: false }
  | { exceeded: true; maxInputTokens: number; contextWindow: number; modelName: string };

/**
 * A model with no known context window passes. Known ones get a third of it, leaving room for
 * the system prompt and the model's output.
 */
export function resolveTokenLimit({
  modelProfile,
  estimatedInputTokens,
}: {
  modelProfile: ModelProfile;
  estimatedInputTokens: number;
}): TokenLimitVerdict {
  if (modelProfile.contextWindow === null) return { exceeded: false };

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

/**
 * Null means "unknown", never "free": a genuinely free model declares an explicit zero
 * price and still computes to 0.
 */
export function estimateModelCostUsd({
  profile,
  inputTokens,
  outputTokens,
}: {
  profile: ModelProfile;
  inputTokens: number;
  outputTokens: number;
}): number | null {
  if (!profile.pricing) return null;

  const inputCost = (inputTokens / 1_000_000) * profile.pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * profile.pricing.outputPerMillion;

  return inputCost + outputCost;
}
