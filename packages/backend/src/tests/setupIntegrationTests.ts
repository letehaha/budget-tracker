/* eslint-disable @typescript-eslint/no-explicit-any */
import { until } from '@common/helpers';
import { afterAll, afterEach, beforeAll, beforeEach, expect, jest } from '@jest/globals';
import { connection } from '@models/index';
import { serverInstance } from '@root/app';
import { loadCurrencyRatesJob } from '@root/crons/exchange-rates';
import { redisClient } from '@root/redis-client';
import { extractResponse, makeRequest } from '@tests/helpers';
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
    { timeout: 10000, interval: 100 },
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

    // Clean up Redis keys for this worker
    const workerKeys = await redisClient.keys(`${process.env.JEST_WORKER_ID}*`);
    if (workerKeys.length) {
      await redisClient.del(workerKeys);
    }

    // Run migrations with deadlock retry (this can be slow with TypeScript)
    await retryWithBackoff(
      async () => {
        await umzug.up();
      },
      15,
      200,
    );

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
      payload: { currencyCode: global.BASE_CURRENCY.code },
    });
  } catch (err) {
    console.error('Setup failed:', err);
    throw err;
  }
}, 30_000); // Increased timeout due to TypeScript migrations and other stuff

afterAll(async () => {
  try {
    await redisClient.close();
    serverInstance.close();
    loadCurrencyRatesJob.stop();
  } catch (err) {
    console.log('afterAll', err);
  }
});
