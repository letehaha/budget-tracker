import { AIFeatureStatus, AI_FEATURE } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { getStoredAiSettings } from '@services/user-settings/ai-connections';
import { z } from 'zod';

import { buildFeatureStatusPayload } from './build-feature-status-payload';

const schema = z.object({});

export const getFeaturesStatus = createController(schema, async ({ user, req }) => {
  const aiSettings = await getStoredAiSettings({ userId: user.id });
  const features: AIFeatureStatus[] = [];

  for (const feature of Object.values(AI_FEATURE)) {
    features.push(await buildFeatureStatusPayload({ req, feature, aiSettings }));
  }

  return {
    data: { features },
  };
});
