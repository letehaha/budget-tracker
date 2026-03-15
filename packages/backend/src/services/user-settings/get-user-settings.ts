import { getDefaultValue } from '@common/helpers/get-default-value-from-zod-schema';
import UserSettings, { SettingsSchema, ZodSettingsSchema } from '@models/user-settings.model';

import { withTransaction } from '../common/with-transaction';

export const getUserSettings = withTransaction(async ({ userId }: { userId: number }): Promise<SettingsSchema> => {
  const userSettings = await UserSettings.findOne({
    where: { userId },
    attributes: ['settings'],
  });

  if (!userSettings) {
    return getDefaultValue(ZodSettingsSchema);
  }

  // Merge defaults with stored settings to include any new fields
  const defaults = getDefaultValue(ZodSettingsSchema);
  return {
    ...defaults,
    ...userSettings.settings,
  };
});
