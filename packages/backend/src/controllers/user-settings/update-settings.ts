import { createController } from '@controllers/helpers/controller-factory';
import { ZodSettingsSchema } from '@models/user-settings.model';
import * as userSettingsService from '@services/user-settings/update-settings';
import { z } from 'zod';

/**
 * Key material is omitted from the body because `GET /user/settings` redacts it, so a client
 * echoing back the settings it read must not be rejected over fields it never received.
 */
const ZodUpdateSettingsBodySchema = ZodSettingsSchema.extend({
  ai: ZodSettingsSchema.shape.ai.unwrap().omit({ apiKeys: true, customEndpoints: true }).optional(),
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
