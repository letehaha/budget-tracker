import './bootstrap';

import { logger } from '@js/utils/logger';
import { createClient } from '@redis/client';

console.log('Initializing Redis client...');
console.time('connect-to-redis');

export const redisClient = createClient({
  socket: {
    host: process.env.APPLICATION_REDIS_HOST,
    connectTimeout: 5000,
  },
});

redisClient
  .connect()
  .then(() => {
    console.log('✅ App connected to Redis! Took: ');
    console.timeEnd('connect-to-redis');
  })
  .catch((err) => {
    console.error('❌ Cannot connect to Redis!', err);
    logger.error({ message: 'Redis connection failed', error: err });
  });

redisClient.on('error', (error: Error) => {
  console.error('❗ Redis Client Error:', error);
  logger.error({ message: 'Redis Client Error', error });
});
