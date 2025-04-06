import './bootstrap';

import { logger } from '@js/utils/logger';
import { createClient } from '@redis/client';
import config from 'config';

export const redisClient = createClient({
  socket: {
    host: config.get('redis.host'),
    connectTimeout: 5000,
  },
});

redisClient
  .connect()
  .then(() => {
    console.log('App connected to Redis! Took: ');
    console.timeEnd('connect-to-redis');
  })
  .catch((err) => {
    console.error('Cannot connect to Redis!', err);
  });

redisClient.on('error', (error: Error) => {
  logger.error({ message: 'Redis Client Error', error });
});
