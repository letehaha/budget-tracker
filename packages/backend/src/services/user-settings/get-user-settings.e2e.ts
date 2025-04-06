import { getDefaultValue } from '@common/helpers/get-default-value-from-zod-schema';
import { describe, expect, it } from '@jest/globals';
import { SettingsSchema, ZodSettingsSchema } from '@models/UserSettings.model';
import * as helpers from '@tests/helpers';

describe('Get user settings', () => {
  it('returns default value when no settings were ever set', async () => {
    const useSettings = await helpers.getUserSettings({ raw: true });
    const defaultUserSettingsValue = getDefaultValue(ZodSettingsSchema);

    expect(useSettings).toStrictEqual(defaultUserSettingsValue);
  });

  it('returns new value after updation', async () => {
    const newSettings: SettingsSchema = {
      stats: { expenses: { excludedCategories: [10] } },
    };

    const response = await helpers.updateUserSettings({
      settings: newSettings,
    });

    expect(response.statusCode).toBe(200);

    const useSettings = await helpers.getUserSettings({ raw: true });

    expect(useSettings).toStrictEqual(newSettings);
  });
});
