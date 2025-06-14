import { createController } from '@controllers/helpers/controller-factory';
import { LockedError } from '@js/errors';
import { logger } from '@js/utils';
import { syncAllSecurities } from '@services/investments/securities-sync.service';
import { z } from 'zod';

export default createController(z.object({}), async () => {
  logger.info('API trigger for securities sync received.');

  // Kick off the sync process but DO NOT await it.
  // This allows the API to respond to the user immediately.
  // Securities syncing is a long process that uses chunks to load data from
  // external providers with rate-limiting, so awaiting makes no sense.
  syncAllSecurities().catch((error) => {
    // This catch block handles errors that might occur in the background
    // long after the API has already responded. We just log them.
    if (error instanceof LockedError) {
      // This is an expected "error" if another process started the sync
      // in the small window after our lock check. We can safely ignore it.
      logger.info(`Background sync was preempted by another process: ${error.message}`);
    } else {
      logger.error('Background securities sync failed after trigger:', error);
    }
  });

  return {
    statusCode: 202,
    data: {
      message: 'Securities sync process has been started.',
    },
  };
});
