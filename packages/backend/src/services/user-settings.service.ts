import { decryptToken, encryptToken } from '@common/utils/encryption';
import UserSettings from '@models/UserSettings.model';
import { DEFAULT_SETTINGS } from '@models/UserSettings.model';

/**
 * Get decrypted Lunch Flow API token for a user
 * @returns The decrypted API token or null if not set
 */
export const getLunchFlowApiToken = async (userId: number): Promise<string | null> => {
  const settings = await UserSettings.findOne({ where: { userId } });

  if (!settings?.settings?.lunchflow?.apiToken) {
    return null;
  }

  return decryptToken(settings.settings.lunchflow.apiToken);
};

/**
 * Get encrypted Lunch Flow API token for a user (for passing to API client)
 * @returns The encrypted API token or null if not set
 */
export const getEncryptedLunchFlowApiToken = async (userId: number): Promise<string | null> => {
  const settings = await UserSettings.findOne({ where: { userId } });

  if (!settings?.settings?.lunchflow?.apiToken) {
    return null;
  }

  return settings.settings.lunchflow.apiToken;
};

/**
 * Store encrypted Lunch Flow API token for a user
 */
export const storeLunchFlowApiToken = async (userId: number, apiToken: string): Promise<void> => {
  const encrypted = encryptToken(apiToken);

  const [settings] = await UserSettings.findOrCreate({
    where: { userId },
    defaults: {
      userId,
      settings: {
        ...DEFAULT_SETTINGS,
        lunchflow: { apiToken: encrypted },
      },
    },
  });

  if (settings) {
    await settings.update({
      settings: {
        ...settings.settings,
        lunchflow: { apiToken: encrypted },
      },
    });
  }
};

/**
 * Remove Lunch Flow API token for a user
 */
export const removeLunchFlowApiToken = async (userId: number): Promise<void> => {
  const settings = await UserSettings.findOne({ where: { userId } });

  if (settings) {
    await settings.update({
      settings: {
        ...settings.settings,
        lunchflow: { apiToken: undefined },
      },
    });
  }
};
