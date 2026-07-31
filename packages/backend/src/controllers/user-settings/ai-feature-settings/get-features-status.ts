import { AIFeatureStatus, AI_FEATURE } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { getAllFeatureConfigs } from '@services/user-settings/ai-feature-settings';
import { z } from 'zod';

import { buildFeatureStatusPayload } from './build-feature-status-payload';

const schema = z.object({});

export const getFeaturesStatus = createController(schema, async ({ user }) => {
  const { id: userId } = user;

  const userConfigs = await getAllFeatureConfigs({ userId });

  const features: AIFeatureStatus[] = await Promise.all(
    Object.values(AI_FEATURE).map((feature) =>
      buildFeatureStatusPayload({
        userId,
        feature,
        config: userConfigs.find((config) => config.feature === feature) ?? null,
      }),
    ),
  );

  return {
    data: { features },
  };
});
