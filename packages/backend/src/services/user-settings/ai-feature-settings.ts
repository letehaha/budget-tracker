import { AIFeatureConfig, AI_FEATURE } from '@bt/shared/types';
import UserSettings, { DEFAULT_SETTINGS, SettingsSchema } from '@models/user-settings.model';

import { resolveLiveModelId } from '../ai/models-config';
import { withTransaction } from '../common/with-transaction';
import { getOrCreateUserSettings } from './get-or-create-user-settings';

// Walks each config through `resolveLiveModelId`. `changed` lets callers skip
// the DB write when no entry was rewritten.
function upgradeFeatureConfigs({ featureConfigs }: { featureConfigs: AIFeatureConfig[] }): {
  upgraded: AIFeatureConfig[];
  changed: boolean;
} {
  let changed = false;
  const upgraded = featureConfigs.map((config) => {
    const liveModelId = resolveLiveModelId({ modelId: config.modelId, feature: config.feature });
    if (liveModelId === config.modelId) return config;
    changed = true;
    return { feature: config.feature, modelId: liveModelId };
  });
  return { upgraded, changed };
}

// Get feature config for one AI feature, null if unset. Retired model IDs are
// silently upgraded via `RETIRED_MODELS` and persisted on first read.
export const getFeatureConfig = withTransaction(
  async ({ userId, feature }: { userId: number; feature: AI_FEATURE }): Promise<AIFeatureConfig | null> => {
    const userSettings = await UserSettings.findOne({ where: { userId } });

    const featureConfigs = userSettings?.settings?.ai?.featureConfigs ?? [];
    if (!userSettings || featureConfigs.length === 0) return null;

    const { upgraded, changed } = upgradeFeatureConfigs({ featureConfigs });

    if (changed) {
      const currentSettings: SettingsSchema = userSettings.settings ?? DEFAULT_SETTINGS;
      const currentAiSettings = currentSettings.ai ?? { apiKeys: [], featureConfigs: [] };
      userSettings.settings = {
        ...currentSettings,
        ai: { ...currentAiSettings, featureConfigs: upgraded },
      };
      await userSettings.save();
    }

    return upgraded.find((c) => c.feature === feature) ?? null;
  },
);

// All feature configs for a user. Retired model IDs are silently upgraded
// via `RETIRED_MODELS` and persisted on first read.
export const getAllFeatureConfigs = withTransaction(
  async ({ userId }: { userId: number }): Promise<AIFeatureConfig[]> => {
    const userSettings = await UserSettings.findOne({ where: { userId } });

    const featureConfigs = userSettings?.settings?.ai?.featureConfigs ?? [];
    if (!userSettings || featureConfigs.length === 0) return featureConfigs;

    const { upgraded, changed } = upgradeFeatureConfigs({ featureConfigs });

    if (changed) {
      const currentSettings: SettingsSchema = userSettings.settings ?? DEFAULT_SETTINGS;
      const currentAiSettings = currentSettings.ai ?? { apiKeys: [], featureConfigs: [] };
      userSettings.settings = {
        ...currentSettings,
        ai: { ...currentAiSettings, featureConfigs: upgraded },
      };
      await userSettings.save();
    }

    return upgraded;
  },
);

// Set feature config. Pass null modelId to clear (falls back to default).
// `modelId` is run through `resolveLiveModelId` before persisting so stale
// picks can't land in storage. Returned config reflects the upgraded ID.
export const setFeatureConfig = withTransaction(
  async ({
    userId,
    feature,
    modelId,
  }: {
    userId: number;
    feature: AI_FEATURE;
    modelId: string | null;
  }): Promise<AIFeatureConfig | null> => {
    const [userSettings] = await getOrCreateUserSettings({ userId });

    const currentSettings: SettingsSchema = userSettings.settings ?? DEFAULT_SETTINGS;
    const currentAiSettings = currentSettings.ai ?? { apiKeys: [], featureConfigs: [] };
    let featureConfigs = [...(currentAiSettings.featureConfigs ?? [])];

    // Remove existing config for this feature
    featureConfigs = featureConfigs.filter((c) => c.feature !== feature);

    let newConfig: AIFeatureConfig | null = null;

    // Add new config if modelId is provided
    if (modelId) {
      const liveModelId = resolveLiveModelId({ modelId, feature });
      newConfig = { feature, modelId: liveModelId };
      featureConfigs.push(newConfig);
    }

    userSettings.settings = {
      ...currentSettings,
      ai: {
        ...currentAiSettings,
        featureConfigs,
      },
    };

    await userSettings.save();

    return newConfig;
  },
);
