import { AIFeatureStatus, AI_FEATURE } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { getStoredAiSettings } from '@services/user-settings/ai-api-key';
import { getAllFeatureConfigs } from '@services/user-settings/ai-feature-settings';
import { z } from 'zod';

import { buildFeatureStatusPayload } from './build-feature-status-payload';

const schema = z.object({});

export const getFeaturesStatus = createController(schema, async ({ user }) => {
  const { id: userId } = user;

  // Configs first: reading them upgrades retired model IDs in place, and the
  // snapshot read below must observe the upgraded blob.
  const userConfigs = await getAllFeatureConfigs({ userId });
  const aiSettings = await getStoredAiSettings({ userId });

  const features: AIFeatureStatus[] = Object.values(AI_FEATURE).map((feature) =>
    buildFeatureStatusPayload({
      feature,
      config: userConfigs.find((config) => config.feature === feature) ?? null,
      aiSettings,
    }),
  );

  return {
    data: { features },
  };
});
