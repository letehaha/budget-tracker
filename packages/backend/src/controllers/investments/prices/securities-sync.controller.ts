import { createController } from '@controllers/helpers/controller-factory';
import { securitiesDailySyncCron } from '@crons/securities-daily-sync';
import { z } from 'zod';

export default createController(z.object({}), async () => {
  await securitiesDailySyncCron.triggerManualSync();

  return {
    data: {
      message: 'Securities daily sync triggered successfully',
      triggered: true,
      timestamp: new Date().toISOString(),
    },
  };
});
