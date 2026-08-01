import { AIApiKeyInfo, AIApiKeyStatus, AIKeyProvider, AI_PROVIDER } from '@bt/shared/types';
import { decryptToken, encryptToken } from '@common/utils/encryption';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import UserSettings, { DEFAULT_SETTINGS, SettingsSchema, StoredAiSettings } from '@models/user-settings.model';
import { validateApiKey } from '@services/ai';

import { withTransaction } from '../common/with-transaction';
import { getOrCreateUserSettings } from './get-or-create-user-settings';
import { migrateFeatureConfigsOnProviderRemoval } from './migrate-feature-configs';

export const getStoredAiSettings = async ({ userId }: { userId: number }): Promise<StoredAiSettings | null> => {
  const userSettings = await UserSettings.findOne({
    where: { userId },
    attributes: ['settings'],
  });

  return userSettings?.settings?.ai ?? null;
};

/** Null when no key is stored for the provider or the ciphertext cannot be read. */
export function decryptStoredApiKey({
  aiSettings,
  provider,
  userId,
}: {
  aiSettings: StoredAiSettings | null;
  provider: AIKeyProvider;
  userId: number;
}): string | null {
  const keyEntry = aiSettings?.apiKeys?.find((k) => k.provider === provider);

  if (!keyEntry?.keyEncrypted) {
    return null;
  }

  try {
    return decryptToken(keyEntry.keyEncrypted);
  } catch (error) {
    // Ciphertext written under a different APPLICATION_JWT_SECRET, or a mangled settings
    // blob. The user cannot cause or fix either one.
    logger.error(
      { message: 'Stored AI provider key could not be decrypted', error: error as Error },
      { userId, provider },
    );
    return null;
  }
}

/**
 * Pass null to remove the key. A new key is validated with a live test call before it is
 * stored; removing one repoints feature configs that used it onto another available provider.
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

    // FOR UPDATE: the whole settings blob is rewritten below, so a concurrent
    // endpoint-status patch must serialize behind this write or it gets lost.
    const [userSettings] = await getOrCreateUserSettings({ userId, lock: true });

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

export const setDefaultAiProvider = withTransaction(
  async ({ userId, provider }: { userId: number; provider: AIKeyProvider }): Promise<void> => {
    const userSettings = await UserSettings.findOne({
      where: { userId },
      lock: true,
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

export const removeAllAiApiKeys = withTransaction(async ({ userId }: { userId: number }): Promise<void> => {
  const userSettings = await UserSettings.findOne({
    where: { userId },
    lock: true,
  });

  if (!userSettings) {
    return;
  }

  const currentSettings: SettingsSchema = userSettings.settings ?? DEFAULT_SETTINGS;

  const currentAiSettings = currentSettings.ai ?? { apiKeys: [], featureConfigs: [] };

  userSettings.settings = {
    ...currentSettings,
    ai: {
      // Only key material goes; feature configs, instructions and endpoints are preferences.
      ...currentAiSettings,
      apiKeys: [],
      defaultProvider: undefined,
    },
  };

  await userSettings.save();
});

export const markApiKeyInvalid = withTransaction(
  async ({
    userId,
    provider,
    errorMessage,
  }: {
    userId: number;
    provider: AIKeyProvider;
    errorMessage: string;
  }): Promise<void> => {
    const userSettings = await UserSettings.findOne({
      where: { userId },
      lock: true,
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

export const markApiKeyValid = withTransaction(
  async ({ userId, provider }: { userId: number; provider: AIKeyProvider }): Promise<void> => {
    const userSettings = await UserSettings.findOne({
      where: { userId },
      lock: true,
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
