import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import Categories from '@models/Categories.model';
import UserSettings, { type SettingsSchema } from '@models/UserSettings.model';

import { withTransaction } from '../common/with-transaction';

export const updateUserSettings = withTransaction(
  async ({ userId, settings }: { userId: number; settings: SettingsSchema }): Promise<SettingsSchema> => {
    const excludedCategories = settings.stats?.expenses?.excludedCategories;

    if (excludedCategories?.length) {
      const existingCategories = await Categories.findAll({
        where: { id: excludedCategories },
        attributes: ['id'],
      });

      if (existingCategories.length !== excludedCategories.length) {
        const existingIds = new Set(existingCategories.map((cat) => cat.id));
        throw new ValidationError({
          message: t({ key: 'userSettings.excludedCategoriesNotFound' }),
          details: {
            invalidCategories: excludedCategories.filter((id) => !existingIds.has(id)),
          },
        });
      }
    }

    const [existingSettings, created] = await UserSettings.findOrCreate({
      where: { userId },
      defaults: { settings },
    });

    if (!created) {
      existingSettings.settings = settings;
      existingSettings.changed('settings', true);
      await existingSettings.save();
    }

    return existingSettings.settings;
  },
);
