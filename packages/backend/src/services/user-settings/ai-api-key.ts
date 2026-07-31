import { AIApiKeyInfo, AIApiKeyStatus, AIKeyProvider, AI_PROVIDER } from '@bt/shared/types';
import { decryptToken, encryptToken } from '@common/utils/encryption';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import UserSettings, { DEFAULT_SETTINGS, SettingsSchema } from '@models/user-settings.model';
import { validateApiKey } from '@services/ai';

import { withTransaction } from '../common/with-transaction';
import { markCustomEndpointInvalid, markCustomEndpointValid } from './ai-custom-endpoint';
import { getOrCreateUserSettings } from './get-or-create-user-settings';
import { migrateFeatureConfigsOnProviderRemoval } from './migrate-feature-configs';

/**
 * Get the decrypted AI API key for a user. Without a provider it falls back to
 * the default provider, then to the first stored key. Null when nothing is set.
 */
export const getAiApiKey = withTransaction(
  async ({ userId, provider }: { userId: number; provider?: AI_PROVIDER }): Promise<string | null> => {
    const userSettings = await UserSettings.findOne({
      where: { userId },
      attributes: ['settings'],
    });

    const aiSettings = userSettings?.settings?.ai;
    if (!aiSettings?.apiKeys?.length) {
      return null;
    }

    const targetProvider = provider ?? aiSettings.defaultProvider ?? aiSettings.apiKeys[0]?.provider;
    const keyEntry = aiSettings.apiKeys.find((k) => k.provider === targetProvider);

    if (!keyEntry?.keyEncrypted) {
      return null;
    }

    try {
      return decryptToken(keyEntry.keyEncrypted);
    } catch {
      return null;
    }
  },
);

/**
 * Set the AI API key for a user and provider (stored encrypted). Pass null to
 * remove it. A new key is validated with a live test call first. Removing a key
 * repoints feature configs that used it onto another available provider.
 */
export const setAiApiKey = withTransaction(
  async ({
    userId,
    apiKey,
    provider,
  }: {
    userId: number;
    apiKey: string | null;
    provider: AIKeyProvider;
  }): Promise<void> => {
    if (apiKey) {
      const validationResult = await validateApiKey({ provider, apiKey });
      if (!validationResult.isValid) {
        throw new ValidationError({
          message: validationResult.error ?? t({ key: 'ai.apiKeyValidationFailed' }),
        });
      }
    }

    const [userSettings] = await getOrCreateUserSettings({ userId });

    const currentSettings: SettingsSchema = userSettings.settings ?? DEFAULT_SETTINGS;
    const currentAiSettings = currentSettings.ai ?? { apiKeys: [], featureConfigs: [] };
    let apiKeys = [...(currentAiSettings.apiKeys ?? [])];

    apiKeys = apiKeys.filter((k) => k.provider !== provider);

    if (apiKey) {
      const now = new Date().toISOString();
      apiKeys.push({
        provider,
        keyEncrypted: encryptToken(apiKey),
        createdAt: now,
        status: 'valid' as AIApiKeyStatus,
        lastValidatedAt: now,
        // No lastError or invalidatedAt since key is valid
      });
    }

    // Update default provider if needed
    let defaultProvider = currentAiSettings.defaultProvider;
    if (apiKeys.length === 0) {
      defaultProvider = undefined;
    } else if (!defaultProvider || !apiKeys.some((k) => k.provider === defaultProvider)) {
      defaultProvider = apiKeys[0]?.provider;
    }

    // Update feature configs when removing a key
    let featureConfigs = [...(currentAiSettings.featureConfigs ?? [])];
    if (!apiKey) {
      featureConfigs = migrateFeatureConfigsOnProviderRemoval({
        featureConfigs,
        removedProvider: provider,
        remainingProviders: apiKeys.map((k) => k.provider),
      });
    }

    userSettings.settings = {
      ...currentSettings,
      ai: {
        ...currentAiSettings,
        apiKeys,
        defaultProvider,
        featureConfigs,
      },
    };

    await userSettings.save();
  },
);

/** Set the default AI provider for a user. */
export const setDefaultAiProvider = withTransaction(
  async ({ userId, provider }: { userId: number; provider: AIKeyProvider }): Promise<void> => {
    const userSettings = await UserSettings.findOne({
      where: { userId },
    });

    if (!userSettings) {
      throw new Error(t({ key: 'userSettings.userSettingsNotFound' }));
    }

    const currentSettings: SettingsSchema = userSettings.settings ?? DEFAULT_SETTINGS;
    const currentAiSettings = currentSettings.ai ?? { apiKeys: [], featureConfigs: [] };

    const hasProvider = currentAiSettings.apiKeys?.some((k) => k.provider === provider);
    if (!hasProvider) {
      throw new Error(t({ key: 'ai.noApiKeyForProvider', variables: { provider } }));
    }

    userSettings.settings = {
      ...currentSettings,
      ai: {
        ...currentAiSettings,
        defaultProvider: provider,
      },
    };

    await userSettings.save();
  },
);

/** Check if a user has an AI API key configured, optionally for a given provider. */
export const hasAiApiKey = withTransaction(
  async ({ userId, provider }: { userId: number; provider?: AI_PROVIDER }): Promise<boolean> => {
    const userSettings = await UserSettings.findOne({
      where: { userId },
      attributes: ['settings'],
    });

    const aiSettings = userSettings?.settings?.ai;
    if (!aiSettings?.apiKeys?.length) {
      return false;
    }

    if (provider) {
      return aiSettings.apiKeys.some((k) => k.provider === provider);
    }

    return true;
  },
);

/** Get information about configured AI API keys, without the keys themselves. */
export const getAiApiKeyInfo = withTransaction(
  async ({
    userId,
  }: {
    userId: number;
  }): Promise<{
    providers: AIApiKeyInfo[];
    defaultProvider?: AIKeyProvider;
  }> => {
    const userSettings = await UserSettings.findOne({
      where: { userId },
      attributes: ['settings'],
    });

    const aiSettings = userSettings?.settings?.ai;
    if (!aiSettings?.apiKeys?.length) {
      return { providers: [] };
    }

    return {
      providers: aiSettings.apiKeys.map((k) => ({
        provider: k.provider,
        createdAt: k.createdAt,
        status: k.status ?? ('valid' as AIApiKeyStatus), // Default for migration
        lastValidatedAt: k.lastValidatedAt ?? k.createdAt, // Default for migration
        lastError: k.lastError,
        invalidatedAt: k.invalidatedAt,
      })),
      defaultProvider: aiSettings.defaultProvider,
    };
  },
);

/** Remove all AI API keys for a user. */
export const removeAllAiApiKeys = withTransaction(async ({ userId }: { userId: number }): Promise<void> => {
  const userSettings = await UserSettings.findOne({
    where: { userId },
  });

  if (!userSettings) {
    return;
  }

  const currentSettings: SettingsSchema = userSettings.settings ?? DEFAULT_SETTINGS;

  const currentAiSettings = currentSettings.ai ?? { apiKeys: [], featureConfigs: [] };

  userSettings.settings = {
    ...currentSettings,
    ai: {
      // Only key material goes. Feature configs, custom instructions and custom
      // endpoints are preferences and stay.
      ...currentAiSettings,
      apiKeys: [],
      defaultProvider: undefined,
    },
  };

  await userSettings.save();
});

/**
 * Mark an API key as invalid after a failed AI call. `AI_PROVIDER.custom` has no
 * `apiKeys` entry: its status lives on the matching `settings.ai.customEndpoints`
 * entry, so the call is forwarded there and needs `customEndpointId`.
 */
export const markApiKeyInvalid = withTransaction(
  async ({
    userId,
    provider,
    customEndpointId,
    errorMessage,
  }: {
    userId: number;
    provider: AI_PROVIDER;
    customEndpointId?: string;
    errorMessage: string;
  }): Promise<void> => {
    if (provider === AI_PROVIDER.custom) {
      if (!customEndpointId) {
        // Every caller resolving `custom` carries the endpoint id, so a missing one is a wiring bug.
        logger.error('Cannot mark custom endpoint invalid without an endpoint id', {
          userId,
          provider,
          customEndpointId: null,
        });
        return;
      }
      await markCustomEndpointInvalid({ userId, endpointId: customEndpointId, errorMessage });
      return;
    }

    const userSettings = await UserSettings.findOne({
      where: { userId },
    });

    if (!userSettings) {
      return;
    }

    const currentSettings: SettingsSchema = userSettings.settings ?? DEFAULT_SETTINGS;
    const currentAiSettings = currentSettings.ai ?? { apiKeys: [], featureConfigs: [] };

    const apiKeys = currentAiSettings.apiKeys.map((k) => {
      if (k.provider === provider) {
        return {
          ...k,
          status: 'invalid' as AIApiKeyStatus,
          lastError: errorMessage,
          invalidatedAt: new Date().toISOString(),
        };
      }
      return k;
    });

    userSettings.settings = {
      ...currentSettings,
      ai: {
        ...currentAiSettings,
        apiKeys,
      },
    };

    await userSettings.save();
  },
);

/**
 * Mark an API key as valid after a successful AI call: refreshes
 * `lastValidatedAt` and clears any previous error. `AI_PROVIDER.custom` keeps its
 * status on `settings.ai.customEndpoints`, so it needs `customEndpointId`.
 */
export const markApiKeyValid = withTransaction(
  async ({
    userId,
    provider,
    customEndpointId,
  }: {
    userId: number;
    provider: AI_PROVIDER;
    customEndpointId?: string;
  }): Promise<void> => {
    if (provider === AI_PROVIDER.custom) {
      if (!customEndpointId) {
        // Every caller resolving `custom` carries the endpoint id, so a missing one is a wiring bug.
        logger.error('Cannot mark custom endpoint valid without an endpoint id', {
          userId,
          provider,
          customEndpointId: null,
        });
        return;
      }
      await markCustomEndpointValid({ userId, endpointId: customEndpointId });
      return;
    }

    const userSettings = await UserSettings.findOne({
      where: { userId },
    });

    if (!userSettings) {
      return;
    }

    const currentSettings: SettingsSchema = userSettings.settings ?? DEFAULT_SETTINGS;
    const currentAiSettings = currentSettings.ai ?? { apiKeys: [], featureConfigs: [] };

    const apiKeys = currentAiSettings.apiKeys.map((k) => {
      if (k.provider === provider) {
        return {
          ...k,
          status: 'valid' as AIApiKeyStatus,
          lastValidatedAt: new Date().toISOString(),
          lastError: undefined,
          invalidatedAt: undefined,
        };
      }
      return k;
    });

    userSettings.settings = {
      ...currentSettings,
      ai: {
        ...currentAiSettings,
        apiKeys,
      },
    };

    await userSettings.save();
  },
);
