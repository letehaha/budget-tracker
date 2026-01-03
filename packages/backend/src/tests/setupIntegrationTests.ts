/* eslint-disable @typescript-eslint/no-explicit-any */
import { until } from '@common/helpers';
import { roundHalfToEven } from '@common/utils/round-half-to-even';
import { afterAll, afterEach, beforeAll, beforeEach, expect, jest } from '@jest/globals';
import { connection } from '@models/index';
import { serverInstance } from '@root/app';
import { loadCurrencyRatesJob } from '@root/crons/exchange-rates';
import { REDIS_KEY_PREFIX, redisClient, redisReady } from '@root/redis-client';
import { categorizationQueue, categorizationWorker } from '@services/ai-categorization/categorization-queue';
import {
  transactionSyncQueue,
  transactionSyncWorker,
} from '@services/bank-data-providers/monobank/transaction-sync-queue';
import { extractCookies, makeAuthRequest, makeRequest } from '@tests/helpers';
import path from 'path';
import Umzug from 'umzug';

import { resetSessionCounter } from './mocks/enablebanking/mock-api';
import { setupMswServer } from './mocks/setup-mock-server';
import { retryWithBackoff } from './utils/retry-db-operation-with-backoff';

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

jest.mock('alphavantage', () =>
  jest.fn().mockReturnValue({
    data: {
      search: jest.fn(),
      quote: jest.fn(),
      daily: jest.fn(),
    },
  }),
);

// Mock the FMP client globally
jest.mock('../services/investments/data-providers/clients/fmp-client', () => ({
  FmpClient: jest.fn().mockImplementation(() => ({
    search: jest.fn(),
    getQuote: jest.fn(),
    getHistoricalPrices: jest.fn(),
    getHistoricalPricesFull: jest.fn(),
  })),
}));

beforeAll(() => mswMockServer.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => {
  mswMockServer.resetHandlers();
  // Reset Enable Banking session counter to ensure test isolation
  // The counter persists across tests and affects mock responses for reconnection testing
  resetSessionCounter();
});
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
global.APP_AUTH_COOKIES = null;

// Track if schema has been set up for this worker
let schemaInitialized = false;

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

/**
 * Tables that contain seed/reference data from migrations and should NOT be truncated.
 * These tables are populated during migration and their data is required for the app to function.
 * Use lowercase for comparison since pg_tables stores names in lowercase.
 */
const SEED_DATA_TABLES = [
  'sequelizemeta', // Migration tracking (SequelizeMeta)
  'currencies', // All world currencies - seeded in migration
  'merchantcategorycodes', // MCC codes - seeded in migration
  'exchangerates', // Exchange rates - seeded with historical rates (10 days ago)
];

/**
 * Fast table truncation - much faster than DROP + migrations
 * Uses TRUNCATE with CASCADE to clear all data while keeping schema intact
 */
async function truncateAllTables() {
  // Get all table names from the database (excluding system/seed tables and backup tables)
  // Use LOWER() for case-insensitive comparison since pg_tables stores names in lowercase
  const excludeList = SEED_DATA_TABLES.map((t) => `'${t}'`).join(', ');
  const [tables] = await connection.sequelize.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND LOWER(tablename) NOT IN (${excludeList})
    AND tablename NOT LIKE '%_backup_%'
  `);

  if (tables.length === 0) return;

  const tableNames = tables.map((t: { tablename: string }) => `"${t.tablename}"`).join(', ');

  // TRUNCATE all tables in a single statement with CASCADE
  // RESTART IDENTITY resets auto-increment counters
  // Use retry logic to handle potential deadlocks with parallel workers
  await retryWithBackoff(
    async () => {
      await connection.sequelize.query(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE`);
    },
    15,
    200,
  );
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

async function waitForRedisConnection() {
  // Wait for Redis to be fully initialized (connected + cleanup done)
  // This uses the redisReady promise from redis-client.ts which ensures
  // clearAllSyncStatuses() has completed before proceeding
  try {
    await redisReady;
  } catch {
    // Redis might have failed to connect initially, try to poll for connection
  }

  // Poll until Redis is ready and responsive
  await until(
    async () => {
      try {
        // Check if client is connected and responsive
        if (redisClient.status !== 'ready') {
          return false;
        }
        const result = await redisClient.ping();
        return result === 'PONG';
      } catch {
        return false;
      }
    },
    { timeout: 15000, interval: 100 },
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
  /**
   * Custom matcher for ref values (refAmount, refInitialBalance, refCurrentBalance, etc.)
   * Applies roundHalfToEven to the expected value and allows ±1 tolerance for floating point precision.
   * Use this matcher exclusively for ref* field comparisons involving currency rate calculations.
   */
  toEqualRefValue(received: number, expected: number) {
    const roundedExpected = roundHalfToEven(expected);
    const pass = Math.abs(received - roundedExpected) <= 1;
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to equal ref value ${roundedExpected} (±1)`
          : `expected ${received} to equal ref value ${roundedExpected} (±1), difference: ${Math.abs(received - roundedExpected)}`,
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

    // Clean up Redis keys for this worker
    // With ioredis keyPrefix, keys('*') returns full keys including prefix
    // We need to strip the prefix before del() to avoid double-prefixing
    const workerKeys = await redisClient.keys('*');
    if (workerKeys.length) {
      const keysWithoutPrefix = REDIS_KEY_PREFIX
        ? workerKeys.map((k) => k.slice(REDIS_KEY_PREFIX!.length))
        : workerKeys;
      await redisClient.del(...keysWithoutPrefix);
    }

    if (!schemaInitialized) {
      // First test in this worker - need to set up schema from scratch
      // Dynamic delay based on worker ID to reduce database contention during initial setup
      const workerId = parseInt(process.env.JEST_WORKER_ID || '1', 10);
      const staggerDelay = workerId * 200; // 200ms per worker
      await new Promise((resolve) => setTimeout(resolve, staggerDelay));

      // Clean up database schema with deadlock retry
      await retryWithBackoff(
        async () => {
          await connection.sequelize.drop({ cascade: true });
          await dropAllEnums(connection.sequelize);
        },
        15,
        200,
      );

      // Run migrations with deadlock retry (this can be slow with TypeScript)
      await retryWithBackoff(
        async () => {
          await umzug.up();
        },
        15,
        200,
      );

      schemaInitialized = true;
    } else {
      // Schema already exists - just truncate tables (much faster!)
      await truncateAllTables();
    }

    // Set up test user for authentication
    // The better-auth mock returns a user with id 'test-user-id', so we need
    // to create a corresponding user in the database with that authUserId.
    const testEmail = 'test1@test.local';
    const testPassword = 'testpassword123';

    // Import user service to create the database user
    const userService = await import('@services/user.service');
    const categoriesService = await import('@services/categories.service');
    const { DEFAULT_CATEGORIES } = await import('@js/const');

    // Create the app user with the expected authUserId from the mock
    const testUser = await userService.createUser({
      username: 'test1',
      authUserId: 'test-user-id', // This must match what the mock returns
    });

    // Create default categories for the test user
    const defaultCategories = DEFAULT_CATEGORIES.main.map((item) => ({
      ...item,
      userId: testUser.id,
    }));

    const categories = await categoriesService.bulkCreate({ data: defaultCategories }, { returning: true });

    // Create subcategories
    let subcats: Array<{
      name: string;
      parentId: number;
      color: string;
      userId: number;
      type: string;
    }> = [];

    categories.forEach((item) => {
      const subcategories = DEFAULT_CATEGORIES.subcategories.find((subcat) => subcat.parentName === item.name);

      if (subcategories) {
        subcats = [
          ...subcats,
          ...subcategories.values.map((subItem) => ({
            ...subItem,
            parentId: item.id,
            color: item.color,
            userId: testUser.id,
          })),
        ];
      }
    });

    if (subcats.length > 0) {
      await categoriesService.bulkCreate({ data: subcats });
    }

    // Set default category
    const defaultCategory = categories.find((item) => item.name === DEFAULT_CATEGORIES.names.other);

    if (defaultCategory) {
      await userService.updateUser({
        id: testUser.id,
        defaultCategoryId: defaultCategory.id,
      });
    }

    // Simulate sign-in to get session cookies from the mock
    const loginRes = await makeAuthRequest({
      method: 'post',
      url: '/auth/sign-in/email',
      payload: {
        email: testEmail,
        password: testPassword,
      },
    });

    // Extract session cookies from the login response
    global.APP_AUTH_COOKIES = extractCookies(loginRes);

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
      payload: { currencyCode: global.BASE_CURRENCY.code },
    });
  } catch (err) {
    console.error('Setup failed:', err);
    throw err;
  }
}, 30_000); // Increased timeout for first test (schema setup)

afterAll(async () => {
  try {
    // Close ALL BullMQ workers and queues first to ensure no pending operations
    // This prevents "The client is closed" errors when workers try to access Redis
    await transactionSyncWorker.close();
    await transactionSyncQueue.close();
    await categorizationWorker.close();
    await categorizationQueue.close();

    // Now safe to close Redis client
    await redisClient.quit();
    serverInstance.close();
    loadCurrencyRatesJob.stop();
  } catch (err) {
    console.log('afterAll', err);
  }
});
