import { createController } from '@controllers/helpers/controller-factory';
import { checkAndTriggerAutoSync } from '@root/services/bank-data-providers/sync/sync-manager';
import { z } from 'zod';

export default createController(z.object({}), async ({ user }) => {
  const result = await checkAndTriggerAutoSync(user.id);

  if (!result) {
    return {
      data: {
        syncTriggered: false,
        message: 'Sync not needed',
      },
    };
  }

  return {
    data: {
      syncTriggered: true,
      ...result,
    },
  };
});
