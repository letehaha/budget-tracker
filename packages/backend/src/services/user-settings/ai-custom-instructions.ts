import { ForbiddenError } from '@js/errors';
import UserSettings, { DEFAULT_SETTINGS, SettingsSchema } from '@models/user-settings.model';

import { withTransaction } from '../common/with-transaction';

/**
 * Get custom AI instructions for a user.
 * Returns undefined if no instructions are set.
 */
export const getCustomInstructions = withTransaction(
  async ({ userId }: { userId: number }): Promise<string | undefined> => {
    const userSettings = await UserSettings.findOne({
      where: { userId },
      attributes: ['settings'],
    });

    return userSettings?.settings?.ai?.customInstructions;
  },
);

/**
 * Set custom AI instructions for a user.
 * Pass empty string to clear instructions.
 * Requires the user to have at least one personal API key.
 */
export const setCustomInstructions = withTransaction(
  async ({ userId, instructions }: { userId: number; instructions: string }): Promise<void> => {
    const [userSettings] = await UserSettings.findOrCreate({
      where: { userId },
      defaults: {
        settings: DEFAULT_SETTINGS,
      },
    });

    const currentSettings: SettingsSchema = userSettings.settings ?? DEFAULT_SETTINGS;
    const currentAiSettings = currentSettings.ai ?? { apiKeys: [], featureConfigs: [] };

    // Require at least one personal API key
    if (!currentAiSettings.apiKeys || currentAiSettings.apiKeys.length === 0) {
      throw new ForbiddenError({
        message: 'A personal AI API key is required to use custom instructions.',
      });
    }

    const trimmed = instructions.trim();

    userSettings.settings = {
      ...currentSettings,
      ai: {
        ...currentAiSettings,
        customInstructions: trimmed || undefined,
      },
    };

    userSettings.changed('settings', true);
    await userSettings.save();
  },
);
