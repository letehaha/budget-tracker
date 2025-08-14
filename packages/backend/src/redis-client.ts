import './bootstrap';

import { logger } from '@js/utils/logger';
import { createClient } from 'redis';

const isTestEnvironment = process.env.NODE_ENV === 'test';

export const redisClient = createClient({
  socket: {
    host: process.env.APPLICATION_REDIS_HOST!,
    connectTimeout: isTestEnvironment ? 2000 : 10000, // Reduced timeout for tests
  },
});

redisClient.on('error', (error: Error) => {
  console.error('❗ Redis Client Error:', error);
  logger.error({ message: 'Redis Client Error', error });
});

// Only auto-connect in production, not in test environment
if (!isTestEnvironment) {
  logger.info('Initializing Redis client...');
  console.time('connect-to-redis');

  redisClient
    .connect()
    .then(() => {
      logger.info('✅ App connected to Redis! Took: ');
      console.timeEnd('connect-to-redis');
    })
    .catch((err) => {
      console.error('❌ Cannot connect to Redis!', err);
      logger.error({ message: 'Redis connection failed', error: err });
    });
} else {
  logger.info('Redis client created with lazy connection for test environment');
}
