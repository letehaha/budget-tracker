import './bootstrap';

import { logger } from '@js/utils/logger';
import { createClient } from 'redis';

import { clearAllSyncStatuses } from './services/bank-data-providers/sync/sync-status-tracker';

logger.info('Initializing Redis client...');

export const redisClient = createClient({
  socket: {
    host: process.env.APPLICATION_REDIS_HOST,
    connectTimeout: 10000,
  },
});

// Promise that resolves when Redis is fully initialized (connected + cleanup done)
export const redisReady: Promise<void> = (async () => {
  const startTime = Date.now();
  try {
    await redisClient.connect();
    logger.info(`✅ App connected to Redis! Took: ${Date.now() - startTime}ms`);

    // Clear stale sync statuses from Redis on startup
    // When app restarts, all in-memory queue states are lost, so Redis should be reset too
    // IMPORTANT: This must be awaited to prevent race conditions in tests
    await clearAllSyncStatuses();
  } catch (err) {
    logger.error({ message: 'Redis connection failed', error: err as Error });
    throw err;
  }
})();

redisClient.on('error', (error: Error) => {
  console.error('❗ Redis Client Error:', error);
  logger.error({ message: 'Redis Client Error', error });
});
