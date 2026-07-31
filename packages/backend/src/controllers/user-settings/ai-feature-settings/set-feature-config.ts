import { AI_CUSTOM_MODEL_PREFIX, AI_FEATURE, AI_CUSTOM_MODEL_NAME_MAX_LENGTH } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { ValidationError } from '@js/errors';
import { isRetiredModelId, isValidModelId } from '@services/ai';
import { setFeatureConfig } from '@services/user-settings/ai-feature-settings';
import { z } from 'zod';

import { buildFeatureStatusPayload } from './build-feature-status-payload';

const schema = z.object({
  params: z.object({
    feature: z.nativeEnum(AI_FEATURE),
  }),
  body: z.object({
    // Fits a catalog ID and 'custom/' + the longest allowed free-text model name
    modelId: z
      .string()
      .min(1)
      .max(AI_CUSTOM_MODEL_PREFIX.length + AI_CUSTOM_MODEL_NAME_MAX_LENGTH),
    // Required alongside a 'custom/*' model ID, ignored for catalog models
    customEndpointId: z.uuid().optional(),
  }),
});

export const setFeatureConfigController = createController(schema, async ({ user, params, body }) => {
  const { id: userId } = user;
  const { feature } = params;
  const { modelId, customEndpointId } = body;

  // Retired aliases accepted; service upgrades + persists the live ID.
  // `custom/*` IDs pass `isValidModelId` and are checked against the user's
  // saved endpoints inside `setFeatureConfig`.
  if (!isValidModelId({ modelId }) && !isRetiredModelId({ modelId })) {
    throw new ValidationError({
      message: `Invalid model ID: ${modelId}`,
    });
  }

  const savedConfig = await setFeatureConfig({ userId, feature, modelId, customEndpointId });

  return {
    data: await buildFeatureStatusPayload({ userId, feature, config: savedConfig }),
  };
});
