/* eslint-disable @typescript-eslint/no-explicit-any */
import { until } from '@common/helpers';
import { usersQuery } from '@controllers/banks/monobank.controller';
import { afterAll, afterEach, beforeAll, beforeEach, expect, jest } from '@jest/globals';
import { connection } from '@models/index';
import { serverInstance } from '@root/app';
import { loadCurrencyRatesJob } from '@root/crons/exchange-rates';
import { redisClient } from '@root/redis-client';
import { extractResponse, makeRequest } from '@tests/helpers';
import path from 'path';
import Umzug from 'umzug';

import { setupMswServer } from './mocks/setup-mock-server';

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

async function dropAllEnums(sequelize) {
  // Get all ENUM types
  const enums = await sequelize.query(`
    SELECT t.typname as enumtype
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    GROUP BY t.typname;
  `);

  // Drop each ENUM
  for (const enumType of enums[0]) {
    await sequelize.query(`DROP TYPE "${enumType.enumtype}" CASCADE`);
  }
}

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
        const result = await redisClient.hello();
        return !!result;
      } catch {
        return false;
      }
    },
    { timeout: 20000, interval: 200 }, // Increased timeout and interval for CI stability
  );
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

    // Dynamic delay based on worker ID to reduce database contention
    const workerId = parseInt(process.env.JEST_WORKER_ID || '1', 10);
    const staggerDelay = (workerId - 1) * 1000; // 1000ms per worker for better CI stability
    await new Promise((resolve) => setTimeout(resolve, staggerDelay));

    // Clean up database schema with retry logic for deadlock handling
    await retryWithBackoff(async () => {
      await connection.sequelize.drop({ cascade: true });
    });

    await retryWithBackoff(async () => {
      await dropAllEnums(connection.sequelize);
    });

    // Clean up Redis keys for this worker
    const workerPrefix = process.env.JEST_WORKER_ID || '1';
    const workerKeys = await redisClient.keys(`${workerPrefix}-*`);
    if (workerKeys.length) {
      await redisClient.del(workerKeys);
    }

    // Clear query cache
    usersQuery.clear();

    // Run migrations with additional delay to avoid race conditions
    await new Promise((resolve) => setTimeout(resolve, workerId * 100)); // Extra stagger for migrations
    await retryWithBackoff(
      async () => {
        await umzug.up();
      },
      15,
      200,
    ); // More retries for migrations

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
      global.BASE_CURRENCY = currencies.find((item) => item.code === global.BASE_CURRENCY_CODE);
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
    await redisClient.close();
    serverInstance.close();
    loadCurrencyRatesJob.stop();
  } catch (err) {
    console.log('afterAll', err);
  }
});
