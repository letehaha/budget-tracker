import { AIApiKeyStatus, AI_PROVIDER } from '@bt/shared/types';
import { decryptToken, encryptToken } from '@common/utils/encryption';
import { ValidationError } from '@js/errors';
import UserSettings, { DEFAULT_SETTINGS, SettingsSchema } from '@models/UserSettings.model';
import { validateApiKey } from '@services/ai';

import { withTransaction } from '../common/with-transaction';

interface AiApiKeyInfo {
  provider: AI_PROVIDER;
  createdAt: string;
  status: AIApiKeyStatus;
  lastValidatedAt: string;
  lastError?: string;
  invalidatedAt?: string;
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
 *
 * When setting a new key, validates it first by making a test API call.
 * Throws ValidationError if the key doesn't work.
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
    // If adding a new key, validate it first
    if (apiKey) {
      const validationResult = await validateApiKey({ provider, apiKey });
      if (!validationResult.isValid) {
        throw new ValidationError({
          message: validationResult.error ?? 'API key validation failed',
        });
      }
    }

    const [userSettings] = await UserSettings.findOrCreate({
      where: { userId },
      defaults: {
        settings: DEFAULT_SETTINGS,
      },
    });

    const currentSettings: SettingsSchema = userSettings.settings ?? DEFAULT_SETTINGS;
    const currentAiSettings = currentSettings.ai ?? { apiKeys: [], featureConfigs: [] };
    let apiKeys = [...(currentAiSettings.apiKeys ?? [])];

    // Remove existing key for this provider
    apiKeys = apiKeys.filter((k) => k.provider !== provider);

    // Add new key if provided
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
      // Set default to first available if current default was removed
      defaultProvider = apiKeys[0]?.provider;
    }

    userSettings.settings = {
      ...currentSettings,
      ai: {
        ...currentAiSettings,
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
    const currentAiSettings = currentSettings.ai ?? { apiKeys: [], featureConfigs: [] };

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
        status: k.status ?? ('valid' as AIApiKeyStatus), // Default for migration
        lastValidatedAt: k.lastValidatedAt ?? k.createdAt, // Default for migration
        lastError: k.lastError,
        invalidatedAt: k.invalidatedAt,
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
    ai: {
      apiKeys: [],
      defaultProvider: undefined,
      // Preserve feature configs so user preferences persist when they add new keys
      featureConfigs: currentSettings.ai?.featureConfigs ?? [],
    },
  };

  await userSettings.save();
});

/**
 * Mark an API key as invalid after a failed AI call.
 * Used when an auth error occurs during actual AI usage.
 */
export const markApiKeyInvalid = withTransaction(
  async ({
    userId,
    provider,
    errorMessage,
  }: {
    userId: number;
    provider: AI_PROVIDER;
    errorMessage: string;
  }): Promise<void> => {
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
 * Mark an API key as valid after a successful AI call.
 * Updates the lastValidatedAt timestamp and clears any previous error.
 */
export const markApiKeyValid = withTransaction(
  async ({ userId, provider }: { userId: number; provider: AI_PROVIDER }): Promise<void> => {
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

/**
 * Get the status of an API key for a specific provider.
 */
export const getApiKeyStatus = withTransaction(
  async ({ userId, provider }: { userId: number; provider: AI_PROVIDER }): Promise<AIApiKeyStatus | null> => {
    const userSettings = await UserSettings.findOne({
      where: { userId },
      attributes: ['settings'],
    });

    const aiSettings = userSettings?.settings?.ai;
    if (!aiSettings?.apiKeys?.length) {
      return null;
    }

    const keyEntry = aiSettings.apiKeys.find((k) => k.provider === provider);
    if (!keyEntry) {
      return null;
    }

    // Default to 'valid' for migration (old entries without status)
    return keyEntry.status ?? 'valid';
  },
);
