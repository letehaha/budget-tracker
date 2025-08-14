/* eslint-disable @typescript-eslint/no-explicit-any */
import { until } from '@common/helpers';
import { usersQuery } from '@controllers/banks/monobank.controller';
import { afterAll, afterEach, beforeAll, beforeEach, expect, jest } from '@jest/globals';
import { connection } from '@models/index';
import { serverInstance } from '@root/app';
import { loadCurrencyRatesJob } from '@root/crons/exchange-rates';
import { seedDatabase } from '@root/seeds';
import { extractResponse, makeRequest } from '@tests/helpers';
import path from 'path';
import Umzug from 'umzug';

import { truncateAllTables } from './helpers/database-cleanup';
import { setupMswServer } from './mocks/setup-mock-server';
import { TestRedisClient } from './redis-client-test';

const mswMockServer = setupMswServer();

// Mock the entire module globally. Mocked implementation will be per-test
jest.mock('@polygon.io/client-js', () => ({
  restClient: jest.fn().mockReturnValue({
    reference: {
      tickers: jest.fn(),
      exchanges: jest.fn(),
    },
    stocks: {
      aggregatesGroupedDaily: jest.fn(),
      aggregates: jest.fn(),
    },
  }),
}));

beforeAll(() => mswMockServer.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => mswMockServer.resetHandlers());
afterAll(() => mswMockServer.close());

global.mswMockServer = mswMockServer;

const umzug = new Umzug({
  migrations: {
    // The params that get passed to the migrations
    params: [connection.sequelize.getQueryInterface(), connection.sequelize.constructor],
    // The path to the migrations directory
    path: path.join(__dirname, '../migrations'),
    pattern: /\.(js|ts)$/,
    // Add a custom resolver to handle .ts files.
    // This tells Umzug to use Node's `require` for any matched file.
    // Because your tests are run with ts-jest, `ts-node` is already
    // registered and will automatically transpile the .ts file when required.
    customResolver: (path) => require(path),
  },
  storage: 'sequelize',
  storageOptions: {
    sequelize: connection.sequelize,
  },
});

global.BASE_CURRENCY = null;
// Should be non-USD so that some tests make sense
global.BASE_CURRENCY_CODE = 'AED';
global.MODELS_CURRENCIES = null;
global.APP_AUTH_TOKEN = null;

async function waitForDatabaseConnection() {
  await until(
    async () => {
      try {
        await connection.sequelize.authenticate();
        return true;
      } catch {
        return false;
      }
    },
    { timeout: 10000, interval: 100 },
  );
}

async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 10,
  baseDelay: number = 100,
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Check if it's a deadlock error
      const isDeadlock = error?.original?.code === '40P01' || error?.message?.includes('deadlock detected');

      if (isDeadlock && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
        console.log(
          `Database deadlock detected (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay.toFixed(0)}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Log detailed error for non-deadlock errors or final retry
      if (!isDeadlock) {
        console.error('Non-deadlock database error:', error.message);
      } else {
        console.error('Database deadlock persisted after all retries:', error.message);
      }

      throw error;
    }
  }

  throw lastError!;
}

async function waitForRedisConnection() {
  await until(
    async () => {
      try {
        const pool = await TestRedisClient.getClient();
        const result = await pool.ping();
        return result === 'PONG';
      } catch {
        return false;
      }
    },
    { timeout: 10000, interval: 100 }, // Reduced timeout since we have faster connection
  );
}

async function cleanupWorkerRedisKeys() {
  const pool = await TestRedisClient.getClient();
  const workerPrefix = process.env.JEST_WORKER_ID || '1';

  // Use Lua script for atomic bulk deletion - much faster than individual operations
  const luaScript = `
    local keys = redis.call('KEYS', ARGV[1])
    if #keys > 0 then
      return redis.call('DEL', unpack(keys))
    end
    return 0
  `;

  try {
    const deletedCount = (await pool.eval(luaScript, {
      keys: [],
      arguments: [`${workerPrefix}-*`],
    })) as number;

    if (deletedCount && deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} Redis keys for worker ${workerPrefix}`);
    }
  } catch (error) {
    // Fallback to traditional method if Lua script fails
    console.warn('Lua script cleanup failed, falling back to traditional method:', error);
    const workerKeys = await pool.keys(`${workerPrefix}-*`);
    if (workerKeys.length) {
      await pool.del(workerKeys);
      console.log(`Cleaned up ${workerKeys.length} Redis keys for worker ${workerPrefix} (fallback)`);
    }
  }
}

expect.extend({
  toBeAnythingOrNull(received) {
    if (received !== undefined) {
      return {
        message: () => `expected ${received} to be anything or null`,
        pass: true,
      };
    }
    return {
      message: () => `expected ${received} not to be undefined`,
      pass: false,
    };
  },
  toBeWithinRange(received: number, target: number, range: number) {
    const pass = Math.abs(received - target) <= range;
    return {
      pass,
      message: () => `expected ${received} to be within ${range} of ${target}`,
    };
  },
  toBeNumericEqual(received, expected) {
    const pass = Number(received) === Number(expected);
    if (pass) {
      return {
        message: () => `expected ${received} not to be numerically equal to ${expected}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be numerically equal to ${expected}`,
        pass: false,
      };
    }
  },
  toBeAfter(received: Date, expected: Date) {
    const pass = received > expected;
    return {
      pass,
      message: () => `expected ${received} to be after ${expected}`,
    };
  },
  toBeBefore(received: Date, expected: Date) {
    const pass = received < expected;
    return {
      pass,
      message: () => `expected ${received} to be before ${expected}`,
    };
  },
});

beforeEach(async () => {
  try {
    // Wait for both database and Redis connections with better error handling
    await Promise.all([waitForDatabaseConnection(), waitForRedisConnection()]);

    await retryWithBackoff(
      async () => {
        await truncateAllTables();
      },
      15,
      200,
    );

    // Clean up Redis keys for this worker using optimized bulk cleanup
    await cleanupWorkerRedisKeys();

    // Clear query cache
    usersQuery.clear();

    await retryWithBackoff(
      async () => {
        await umzug.up();
      },
      15,
      200,
    ); // More retries for migrations

    // Run database seeding after migrations
    await retryWithBackoff(
      async () => {
        const queryInterface = connection.sequelize.getQueryInterface();
        await seedDatabase(queryInterface, 'test');
      },
      10,
      150,
    ); // Retry seeding with deadlock protection

    // Set up test user
    await makeRequest({
      method: 'post',
      url: '/auth/register',
      payload: {
        username: 'test1',
        password: 'test1',
      },
    });

    const res = await makeRequest({
      method: 'post',
      url: '/auth/login',
      payload: {
        username: 'test1',
        password: 'test1',
      },
    });

    global.APP_AUTH_TOKEN = extractResponse(res).token;

    // Don't waste time, just store base_currency to the global variable to not
    // call this request each time
    if (!global.BASE_CURRENCY || !global.MODELS_CURRENCIES) {
      const currencies = await makeRequest({
        method: 'get',
        url: '/models/currencies',
        raw: true,
      });

      global.MODELS_CURRENCIES = currencies;
      global.BASE_CURRENCY = currencies.find((item: any) => item.code === global.BASE_CURRENCY_CODE);
    }

    await makeRequest({
      method: 'post',
      url: '/user/currencies/base',
      payload: { currencyId: global.BASE_CURRENCY.id },
    });
  } catch (err) {
    console.error('Setup failed:', err);
    throw err;
  }
}, 120_000); // Increased timeout for CI stability with longer stagger delays

afterAll(async () => {
  try {
    await TestRedisClient.closeConnection();
    serverInstance.close();
    loadCurrencyRatesJob.stop();
  } catch (err) {
    console.log('afterAll', err);
  }
});
