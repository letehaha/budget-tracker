import { t } from '@i18n/index';
import { ForbiddenError } from '@js/errors';
import UserSettings, { DEFAULT_SETTINGS, SettingsSchema } from '@models/user-settings.model';

import { withTransaction } from '../common/with-transaction';
import { getOrCreateUserSettings } from './get-or-create-user-settings';

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
 * Requires the user to have at least one AI connection of their own.
 */
export const setCustomInstructions = withTransaction(
  async ({ userId, instructions }: { userId: number; instructions: string }): Promise<void> => {
    const [userSettings] = await getOrCreateUserSettings({ userId });

    const currentSettings: SettingsSchema = userSettings.settings ?? DEFAULT_SETTINGS;
    const currentAiSettings = currentSettings.ai ?? {};

    if (!currentAiSettings.connections?.length) {
      throw new ForbiddenError({ message: t({ key: 'ai.customInstructionsNeedConnection' }) });
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
