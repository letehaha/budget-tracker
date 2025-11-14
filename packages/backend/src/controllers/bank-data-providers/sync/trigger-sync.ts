import { createController } from '@controllers/helpers/controller-factory';
import { syncAllUserAccounts } from '@root/services/bank-data-providers/sync/sync-manager';
import { updateLastAutoSync } from '@root/services/bank-data-providers/sync/sync-status-tracker';
import { z } from 'zod';

export default createController(z.object({}), async ({ user }) => {
  // Update last sync timestamp to prevent immediate auto-sync
  await updateLastAutoSync(user.id);

  const result = await syncAllUserAccounts(user.id);

  return {
    data: result,
  };
});
