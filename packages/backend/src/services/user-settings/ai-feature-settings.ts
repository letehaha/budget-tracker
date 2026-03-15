import { AIFeatureConfig, AI_FEATURE } from '@bt/shared/types';
import UserSettings, { DEFAULT_SETTINGS, SettingsSchema } from '@models/UserSettings.model';

import { withTransaction } from '../common/with-transaction';

/**
 * Get the feature configuration for a specific AI feature.
 * Returns null if no custom configuration is set.
 */
export const getFeatureConfig = withTransaction(
  async ({ userId, feature }: { userId: number; feature: AI_FEATURE }): Promise<AIFeatureConfig | null> => {
    const userSettings = await UserSettings.findOne({
      where: { userId },
      attributes: ['settings'],
    });

    const featureConfigs = userSettings?.settings?.ai?.featureConfigs ?? [];
    const config = featureConfigs.find((c) => c.feature === feature);

    return config ?? null;
  },
);

/**
 * Get all feature configurations for a user.
 */
export const getAllFeatureConfigs = withTransaction(
  async ({ userId }: { userId: number }): Promise<AIFeatureConfig[]> => {
    const userSettings = await UserSettings.findOne({
      where: { userId },
      attributes: ['settings'],
    });

    return userSettings?.settings?.ai?.featureConfigs ?? [];
  },
);

/**
 * Set the model configuration for a specific AI feature.
 * Pass null as modelId to remove the custom configuration (use default).
 */
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
    const [userSettings] = await UserSettings.findOrCreate({
      where: { userId },
      defaults: {
        settings: DEFAULT_SETTINGS,
      },
    });

    const currentSettings: SettingsSchema = userSettings.settings ?? DEFAULT_SETTINGS;
    const currentAiSettings = currentSettings.ai ?? { apiKeys: [], featureConfigs: [] };
    let featureConfigs = [...(currentAiSettings.featureConfigs ?? [])];

    // Remove existing config for this feature
    featureConfigs = featureConfigs.filter((c) => c.feature !== feature);

    let newConfig: AIFeatureConfig | null = null;

    // Add new config if modelId is provided
    if (modelId) {
      newConfig = { feature, modelId };
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
