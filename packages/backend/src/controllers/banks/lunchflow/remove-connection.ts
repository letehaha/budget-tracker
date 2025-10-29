import { createController } from '@controllers/helpers/controller-factory';
import * as lunchflowService from '@services/banks/lunchflow/remove-connection';
import { z } from 'zod';

export default createController(z.object({}), async ({ user }) => {
  const data = await lunchflowService.removeConnection({ userId: user.id });
  return { data };
});
