import Categories from '@models/Categories.model';
import UserSettings, { DEFAULT_SETTINGS } from '@models/UserSettings.model';

import { withTransaction } from '../common/with-transaction';

export const editExcludedCategories = withTransaction(
  async ({
    userId,
    addIds = [],
    removeIds = [],
  }: {
    userId: number;
    addIds?: number[];
    removeIds?: number[];
  }): Promise<number[]> => {
    const [existingSettings] = await UserSettings.findOrCreate({
      where: { userId },
      defaults: {
        settings: DEFAULT_SETTINGS,
      },
    });

    let currentExcludedCategories = existingSettings.settings.stats.expenses.excludedCategories || [];

    const validAddIds = await Categories.findAll({
      where: { id: addIds },
    }).then((categories) => categories.map((category) => category.id));

    currentExcludedCategories = currentExcludedCategories.filter((id) => !removeIds?.includes(id));

    currentExcludedCategories = [...new Set([...currentExcludedCategories, ...validAddIds])];

    existingSettings.settings.stats.expenses.excludedCategories = currentExcludedCategories;
    existingSettings.changed('settings', true);
    await existingSettings.save();

    return currentExcludedCategories;
  },
);
