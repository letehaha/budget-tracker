import './bootstrap';

import { logger } from '@js/utils/logger';
import { createClient } from 'redis';

import { clearAllSyncStatuses } from './services/bank-data-providers/sync/sync-status-tracker';

logger.info('Initializing Redis client...');
console.time('connect-to-redis');

export const redisClient = createClient({
  socket: {
    host: process.env.APPLICATION_REDIS_HOST,
    connectTimeout: 10000,
  },
});

redisClient
  .connect()
  .then(() => {
    logger.info('✅ App connected to Redis! Took: ');
    console.timeEnd('connect-to-redis');

    // Clear stale sync statuses from Redis on startup
    // When app restarts, all in-memory queue states are lost, so Redis should be reset too
    clearAllSyncStatuses();
  })
  .catch((err) => {
    console.error('❌ Cannot connect to Redis!', err);
    logger.error({ message: 'Redis connection failed', error: err });
  });

redisClient.on('error', (error: Error) => {
  console.error('❗ Redis Client Error:', error);
  logger.error({ message: 'Redis Client Error', error });
});
