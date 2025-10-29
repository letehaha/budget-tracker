import { createController } from '@controllers/helpers/controller-factory';
import * as lunchflowService from '@services/banks/lunchflow/sync-accounts';
import { z } from 'zod';

export default createController(z.object({}), async ({ user }) => {
  const data = await lunchflowService.syncAccounts({ userId: user.id });
  return { data };
});
