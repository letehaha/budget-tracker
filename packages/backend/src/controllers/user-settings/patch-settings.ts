import { createController } from '@controllers/helpers/controller-factory';
import { ZodSettingsPatchSchema } from '@models/user-settings.model';
import * as userSettingsService from '@services/user-settings/patch-settings';
import { z } from 'zod';

const schema = z.object({
  body: ZodSettingsPatchSchema,
});

export default createController(schema, async ({ user, body }) => {
  const { id: userId } = user;

  const data = await userSettingsService.patchUserSettings({
    userId,
    patch: body,
  });

  return { data };
});
