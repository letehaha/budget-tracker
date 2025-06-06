import { createController } from '@controllers/helpers/controller-factory';
import { ZodSettingsSchema } from '@models/UserSettings.model';
import * as userSettingsService from '@services/user-settings/update-settings';
import { z } from 'zod';

const schema = z.object({
  body: ZodSettingsSchema,
});

export default createController(schema, async ({ user, body }) => {
  const { id: userId } = user;
  const settings = body;

  const data = await userSettingsService.updateUserSettings({
    userId,
    settings,
  });

  return { data };
});
