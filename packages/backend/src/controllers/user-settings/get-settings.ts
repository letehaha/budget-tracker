import { createController } from '@controllers/helpers/controller-factory';
import * as userSettingsService from '@services/user-settings/get-user-settings';
import { z } from 'zod';

const schema = z.object({});

export default createController(schema, async ({ user }) => {
  const { id: userId } = user;
  const data = await userSettingsService.getUserSettings({ userId });

  return { data };
});
