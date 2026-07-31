import { AI_FEATURE } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { setFeatureConfig } from '@services/user-settings/ai-feature-settings';
import { z } from 'zod';

import { buildFeatureStatusPayload } from './build-feature-status-payload';

const schema = z.object({
  params: z.object({
    feature: z.nativeEnum(AI_FEATURE),
  }),
});

export const resetFeatureConfigController = createController(schema, async ({ user, params }) => {
  const { id: userId } = user;
  const { feature } = params;

  await setFeatureConfig({ userId, feature, modelId: null });

  return {
    data: await buildFeatureStatusPayload({ userId, feature, config: null }),
  };
});
