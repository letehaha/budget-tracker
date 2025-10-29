import { createController } from '@controllers/helpers/controller-factory';
import { lunchflowSyncCron } from '@crons/lunchflow-sync';
import { z } from 'zod';

export default createController(z.object({}), async () => {
  const result = await lunchflowSyncCron.triggerManualSync();

  return {
    data: {
      message: 'Lunchflow sync triggered successfully',
      triggered: true,
      timestamp: new Date().toISOString(),
      ...result,
    },
  };
});
