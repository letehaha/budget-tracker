import { getDefaultValue } from '@common/helpers/get-default-value-from-zod-schema';
import UserSettings, { SettingsSchema, ZodSettingsSchema } from '@models/UserSettings.model';

import { withTransaction } from '../common/with-transaction';

export const getUserSettings = withTransaction(async ({ userId }: { userId: number }): Promise<SettingsSchema> => {
  const userSettings = await UserSettings.findOne({
    where: { userId },
    attributes: ['settings'],
  });

  if (!userSettings) {
    return getDefaultValue(ZodSettingsSchema);
  }

  return userSettings.settings;
});
