import { createController } from '@controllers/helpers/controller-factory';
import { ZodSettingsSchema } from '@models/user-settings.model';
import * as userSettingsService from '@services/user-settings/update-settings';
import { z } from 'zod';

/** Service-owned AI slices are dropped unvalidated: the service strips them anyway. */
const ZodUpdateSettingsBodySchema = ZodSettingsSchema.extend({
  ai: ZodSettingsSchema.shape.ai.unwrap().omit({ connections: true, featureConfigs: true }).optional(),
});

const schema = z.object({
  body: ZodUpdateSettingsBodySchema,
});

export default createController(schema, async ({ user, body }) => {
  const { id: userId } = user;

  const data = await userSettingsService.updateUserSettings({
    userId,
    settings: body,
  });

  return { data };
});
