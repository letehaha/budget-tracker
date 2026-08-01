import { AI_FEATURE } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { getStoredAiSettings } from '@services/user-settings/ai-api-key';
import { getFeatureConfig } from '@services/user-settings/ai-feature-settings';
import { z } from 'zod';

import { buildFeatureStatusPayload } from './build-feature-status-payload';

const schema = z.object({
  params: z.object({
    feature: z.nativeEnum(AI_FEATURE),
  }),
});

export const getFeatureConfigController = createController(schema, async ({ user, params }) => {
  const { id: userId } = user;
  const { feature } = params;

  const config = await getFeatureConfig({ userId, feature });
  const aiSettings = await getStoredAiSettings({ userId });

  return {
    data: buildFeatureStatusPayload({ feature, config, aiSettings }),
  };
});
