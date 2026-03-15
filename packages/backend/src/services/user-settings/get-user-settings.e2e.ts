import { getDefaultValue } from '@common/helpers/get-default-value-from-zod-schema';
import { SettingsSchema, ZodSettingsSchema } from '@models/user-settings.model';
import * as helpers from '@tests/helpers';
import { describe, expect, it } from 'vitest';

describe('Get user settings', () => {
  it('returns default value when no settings were ever set', async () => {
    const useSettings = await helpers.getUserSettings({ raw: true });
    const defaultUserSettingsValue = getDefaultValue(ZodSettingsSchema);

    expect(useSettings).toStrictEqual(defaultUserSettingsValue);
  });

  it('returns new value after updation', async () => {
    const newSettings: SettingsSchema = {
      locale: 'uk',
    };

    const response = await helpers.updateUserSettings({
      settings: newSettings,
    });

    expect(response.statusCode).toBe(200);

    const useSettings = await helpers.getUserSettings({ raw: true });

    expect(useSettings).toStrictEqual(newSettings);
  });
});
