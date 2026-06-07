import { AI_FEATURE } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import UserSettings, { DEFAULT_SETTINGS } from '@models/user-settings.model';
import Users from '@models/users.model';
import { makeRequest } from '@tests/helpers/common';

// Anthropic-retired alias – stored value would 404 at call time until upgraded.
const RETIRED_MODEL_ID = 'anthropic/claude-3-5-haiku-latest';
const LIVE_REPLACEMENT_ID = 'anthropic/claude-haiku-4-5';

async function getTestUserId(): Promise<number> {
  const user = await Users.findOne({ where: { username: 'test1' } });
  if (!user) throw new Error('Test user not found');
  return user.id;
}

async function seedFeatureConfig({
  userId,
  feature,
  modelId,
}: {
  userId: number;
  feature: AI_FEATURE;
  modelId: string;
}): Promise<void> {
  const [settings] = await UserSettings.findOrCreate({
    where: { userId },
    defaults: { settings: DEFAULT_SETTINGS },
  });

  settings.settings = {
    ...settings.settings,
    ai: {
      ...(settings.settings.ai ?? { apiKeys: [], featureConfigs: [] }),
      featureConfigs: [{ feature, modelId }],
    },
  };

  await settings.save();
}

async function readStoredModelId({ userId, feature }: { userId: number; feature: AI_FEATURE }): Promise<string | null> {
  const settings = await UserSettings.findOne({ where: { userId } });
  return settings?.settings?.ai?.featureConfigs?.find((c) => c.feature === feature)?.modelId ?? null;
}

describe('AI feature settings – lazy upgrade of retired model IDs', () => {
  describe('GET /user/settings/ai/features', () => {
    it('rewrites a retired model in the response and persists the upgrade', async () => {
      const userId = await getTestUserId();
      await seedFeatureConfig({
        userId,
        feature: AI_FEATURE.categorization,
        modelId: RETIRED_MODEL_ID,
      });

      const response = await makeRequest<{ features: Array<{ feature: AI_FEATURE; modelId: string }> }, true>({
        method: 'get',
        url: '/user/settings/ai/features',
        raw: true,
      });

      const categorization = response.features.find((f) => f.feature === AI_FEATURE.categorization);
      expect(categorization?.modelId).toBe(LIVE_REPLACEMENT_ID);

      const persisted = await readStoredModelId({ userId, feature: AI_FEATURE.categorization });
      expect(persisted).toBe(LIVE_REPLACEMENT_ID);
    });

    it('leaves already-live model IDs untouched', async () => {
      const userId = await getTestUserId();
      await seedFeatureConfig({
        userId,
        feature: AI_FEATURE.categorization,
        modelId: LIVE_REPLACEMENT_ID,
      });

      await makeRequest({ method: 'get', url: '/user/settings/ai/features', raw: true });

      const persisted = await readStoredModelId({ userId, feature: AI_FEATURE.categorization });
      expect(persisted).toBe(LIVE_REPLACEMENT_ID);
    });
  });

  describe('GET /user/settings/ai/features/:feature', () => {
    it('rewrites a retired model in the response and persists the upgrade', async () => {
      const userId = await getTestUserId();
      await seedFeatureConfig({
        userId,
        feature: AI_FEATURE.statementParsing,
        modelId: RETIRED_MODEL_ID,
      });

      const response = await makeRequest<{ modelId: string; isConfigured: boolean }, true>({
        method: 'get',
        url: `/user/settings/ai/features/${AI_FEATURE.statementParsing}`,
        raw: true,
      });

      expect(response.modelId).toBe(LIVE_REPLACEMENT_ID);
      expect(response.isConfigured).toBe(true);

      const persisted = await readStoredModelId({ userId, feature: AI_FEATURE.statementParsing });
      expect(persisted).toBe(LIVE_REPLACEMENT_ID);
    });
  });

  describe('PUT /user/settings/ai/features/:feature', () => {
    it('accepts a retired model ID and silently upgrades + persists it', async () => {
      const userId = await getTestUserId();

      const response = await makeRequest<{ modelId: string; isConfigured: boolean }, true>({
        method: 'put',
        url: `/user/settings/ai/features/${AI_FEATURE.categorization}`,
        payload: { modelId: RETIRED_MODEL_ID },
        raw: true,
      });

      expect(response.modelId).toBe(LIVE_REPLACEMENT_ID);
      expect(response.isConfigured).toBe(true);

      const persisted = await readStoredModelId({ userId, feature: AI_FEATURE.categorization });
      expect(persisted).toBe(LIVE_REPLACEMENT_ID);
    });

    it('rejects a fully unknown model ID with 422', async () => {
      const response = await makeRequest({
        method: 'put',
        url: `/user/settings/ai/features/${AI_FEATURE.categorization}`,
        payload: { modelId: 'anthropic/this-model-never-existed' },
      });

      expect(response.statusCode).toBe(422);
    });
  });
});
