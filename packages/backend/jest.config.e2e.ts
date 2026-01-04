import baseConfig from './jest.config.base';

console.log('❗ RUNNING INTEGRATION TESTS');

/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
export default {
  ...baseConfig,
  maxWorkers: Number(process.env.JEST_WORKERS_AMOUNT),
  testMatch: ['<rootDir>/src/**/?(*.)+(e2e).[jt]s?(x)'],
  setupFilesAfterEnv: ['<rootDir>/src/tests/setupIntegrationTests.ts'],
  testTimeout: 15000, // 15 seconds timeout for all e2e tests
  // Restart worker when it exceeds 1GB to prevent OOM during long test runs on CI
  workerIdleMemoryLimit: '1GB',
};
