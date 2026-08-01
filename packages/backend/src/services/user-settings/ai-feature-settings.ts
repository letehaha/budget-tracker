import {
  AIFeatureConfig,
  AI_CUSTOM_MODEL_NAME_MAX_LENGTH,
  AI_FEATURE,
  getModelNameFromModelId,
  isCustomModelId,
} from '@bt/shared/types';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import UserSettings, { DEFAULT_SETTINGS, SettingsSchema } from '@models/user-settings.model';

import { validateCustomEndpoint } from '../ai/custom-endpoint-validation';
import { resolveLiveModelId } from '../ai/models-config';
import { withTransaction } from '../common/with-transaction';
import { assertStoredKeyReadable, getCustomEndpointById } from './ai-custom-endpoint';
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
    return { ...config, modelId: liveModelId };
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

/**
 * Validates a `custom/*` pick before storing. The live probe is the point: without it a typo
 * in the model name saves cleanly and then fails on every AI call, where model-not-found is
 * indistinguishable from any other server error.
 */
async function assertCustomModelIsServed({
  userId,
  modelId,
  customEndpointId,
}: {
  userId: number;
  modelId: string;
  customEndpointId?: string;
}): Promise<void> {
  const modelName = getModelNameFromModelId({ modelId });

  if (modelName.length === 0 || modelName.length > AI_CUSTOM_MODEL_NAME_MAX_LENGTH) {
    throw new ValidationError({ message: t({ key: 'ai.customModelNameInvalidLength' }) });
  }

  if (!customEndpointId) {
    throw new ValidationError({ message: t({ key: 'ai.customEndpointIdRequired' }) });
  }

  const endpoint = await getCustomEndpointById({ userId, endpointId: customEndpointId });

  if (!endpoint) {
    throw new ValidationError({ message: t({ key: 'ai.customEndpointNotFound' }) });
  }

  assertStoredKeyReadable({ hasApiKey: endpoint.hasApiKey, apiKey: endpoint.apiKey });

  const validation = await validateCustomEndpoint({
    baseUrl: endpoint.baseUrl,
    modelName,
    apiKey: endpoint.apiKey,
  });

  if (!validation.isValid) {
    throw new ValidationError({ message: validation.error ?? t({ key: 'ai.customEndpointValidationFailed' }) });
  }
}

const storeFeatureConfig = withTransaction(
  async ({
    userId,
    feature,
    modelId,
    customEndpointId,
  }: {
    userId: number;
    feature: AI_FEATURE;
    modelId: string | null;
    customEndpointId?: string;
  }): Promise<AIFeatureConfig | null> => {
    const [userSettings] = await getOrCreateUserSettings({ userId, lock: true });

    const currentSettings: SettingsSchema = userSettings.settings ?? DEFAULT_SETTINGS;
    const currentAiSettings = currentSettings.ai ?? { apiKeys: [], featureConfigs: [] };
    let featureConfigs = [...(currentAiSettings.featureConfigs ?? [])];

    featureConfigs = featureConfigs.filter((c) => c.feature !== feature);

    let newConfig: AIFeatureConfig | null = null;

    if (modelId) {
      const liveModelId = resolveLiveModelId({ modelId, feature });
      newConfig = isCustomModelId({ modelId })
        ? { feature, modelId: liveModelId, customEndpointId }
        : { feature, modelId: liveModelId };
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

/**
 * Pass null modelId to clear, so the feature falls back to its default. A `custom/*` pick is
 * probed before the transaction opens so the live LLM call does not pin a database connection.
 */
export const setFeatureConfig = async ({
  userId,
  feature,
  modelId,
  customEndpointId,
}: {
  userId: number;
  feature: AI_FEATURE;
  modelId: string | null;
  customEndpointId?: string;
}): Promise<AIFeatureConfig | null> => {
  if (modelId && isCustomModelId({ modelId })) {
    await assertCustomModelIsServed({ userId, modelId, customEndpointId });
  }

  return storeFeatureConfig({ userId, feature, modelId, customEndpointId });
};
