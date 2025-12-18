import { AI_PROVIDER } from '@bt/shared/types';
import { decryptToken, encryptToken } from '@common/utils/encryption';
import UserSettings, { DEFAULT_SETTINGS, SettingsSchema } from '@models/UserSettings.model';

import { withTransaction } from '../common/with-transaction';

interface AiApiKeyInfo {
  provider: AI_PROVIDER;
  createdAt: string;
}

/**
 * Get the decrypted AI API key for a user.
 * If provider is specified, returns the key for that provider.
 * Otherwise, returns the key for the default provider (or the first available).
 * Returns null if no key is set.
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

    // Find the key for the requested provider, default provider, or first available
    const targetProvider = provider ?? aiSettings.defaultProvider ?? aiSettings.apiKeys[0]?.provider;
    const keyEntry = aiSettings.apiKeys.find((k) => k.provider === targetProvider);

    if (!keyEntry?.keyEncrypted) {
      return null;
    }

    try {
      return decryptToken(keyEntry.keyEncrypted);
    } catch {
      // If decryption fails (e.g., key was corrupted), return null
      return null;
    }
  },
);

/**
 * Set the AI API key for a user and specific provider (stores encrypted).
 * Pass null as apiKey to remove the key for the provider.
 */
export const setAiApiKey = withTransaction(
  async ({
    userId,
    apiKey,
    provider,
  }: {
    userId: number;
    apiKey: string | null;
    provider: AI_PROVIDER;
  }): Promise<void> => {
    const [userSettings] = await UserSettings.findOrCreate({
      where: { userId },
      defaults: {
        settings: DEFAULT_SETTINGS,
      },
    });

    const currentSettings: SettingsSchema = userSettings.settings ?? DEFAULT_SETTINGS;
    const currentAiSettings = currentSettings.ai ?? { apiKeys: [] };
    let apiKeys = [...(currentAiSettings.apiKeys ?? [])];

    // Remove existing key for this provider
    apiKeys = apiKeys.filter((k) => k.provider !== provider);

    // Add new key if provided
    if (apiKey) {
      apiKeys.push({
        provider,
        keyEncrypted: encryptToken(apiKey),
        createdAt: new Date().toISOString(),
      });
    }

    // Update default provider if needed
    let defaultProvider = currentAiSettings.defaultProvider;
    if (apiKeys.length === 0) {
      defaultProvider = undefined;
    } else if (!defaultProvider || !apiKeys.some((k) => k.provider === defaultProvider)) {
      // Set default to first available if current default was removed
      defaultProvider = apiKeys[0]?.provider;
    }

    userSettings.settings = {
      ...currentSettings,
      ai: {
        apiKeys,
        defaultProvider,
      },
    };

    await userSettings.save();
  },
);

/**
 * Set the default AI provider for a user.
 */
export const setDefaultAiProvider = withTransaction(
  async ({ userId, provider }: { userId: number; provider: AI_PROVIDER }): Promise<void> => {
    const userSettings = await UserSettings.findOne({
      where: { userId },
    });

    if (!userSettings) {
      throw new Error('User settings not found');
    }

    const currentSettings: SettingsSchema = userSettings.settings ?? DEFAULT_SETTINGS;
    const currentAiSettings = currentSettings.ai ?? { apiKeys: [] };

    // Verify the provider has a key configured
    const hasProvider = currentAiSettings.apiKeys?.some((k) => k.provider === provider);
    if (!hasProvider) {
      throw new Error(`No API key configured for provider: ${provider}`);
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

/**
 * Check if a user has an AI API key configured.
 * If provider is specified, checks for that specific provider.
 */
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

/**
 * Get information about configured AI API keys (without the actual keys).
 */
export const getAiApiKeyInfo = withTransaction(
  async ({
    userId,
  }: {
    userId: number;
  }): Promise<{
    providers: AiApiKeyInfo[];
    defaultProvider?: AI_PROVIDER;
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
      })),
      defaultProvider: aiSettings.defaultProvider,
    };
  },
);

/**
 * Remove all AI API keys for a user.
 */
export const removeAllAiApiKeys = withTransaction(async ({ userId }: { userId: number }): Promise<void> => {
  const userSettings = await UserSettings.findOne({
    where: { userId },
  });

  if (!userSettings) {
    return;
  }

  const currentSettings: SettingsSchema = userSettings.settings ?? DEFAULT_SETTINGS;

  userSettings.settings = {
    ...currentSettings,
    ai: undefined,
  };

  await userSettings.save();
});
