import { logger } from '@js/utils/logger';
import { createClientPool, RedisClientPoolType } from 'redis';

class TestRedisClient {
  private static pool: RedisClientPoolType | null = null;
  private static connectionPromise: Promise<RedisClientPoolType> | null = null;

  static async getClient(): Promise<RedisClientPoolType> {
    if (this.pool) {
      return this.pool;
    }

    // Prevent multiple connection attempts
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.createPool();
    return this.connectionPromise;
  }

  private static async createPool(): Promise<RedisClientPoolType> {
    if (this.pool) {
      try {
        await this.pool.destroy();
      } catch (error) {
        // Ignore errors when closing existing pool
      }
    }

    logger.info('Creating optimized Redis pool for tests...');

    this.pool = createClientPool({
      socket: {
        host: process.env.APPLICATION_REDIS_HOST || 'test-redis',
        connectTimeout: 2000, // Reduced from 10000ms
      },
    }, {
      // Pool configuration
      minimum: 1,    // Minimum connections in pool
      maximum: 10,   // Maximum connections for parallel test workers
    });

    this.pool.on('error', (error: Error) => {
      console.error('❗ Test Redis Pool Error:', error);
      logger.error({ message: 'Test Redis Pool Error', error });
    });

    this.pool.on('connect', () => {
      logger.info('✅ Test Redis pool connected successfully');
    });

    // Pool connects automatically when first command is executed
    return this.pool;
  }

  static async closeConnection(): Promise<void> {
    if (this.pool) {
      await this.pool.destroy();
      this.pool = null;
      this.connectionPromise = null;
      logger.info('✅ Test Redis pool closed');
    }
  }

  static isConnected(): boolean {
    return this.pool !== null;
  }
}

export { TestRedisClient };
