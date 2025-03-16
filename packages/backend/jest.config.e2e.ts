import baseConfig from './jest.config.base';

console.log('❗ RUNNING INTEGRATION TESTS');

/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
export default {
  ...baseConfig,
  maxWorkers: Number(process.env.JEST_WORKERS_AMOUNT),
  testMatch: ['<rootDir>/src/**/?(*.)+(e2e).[jt]s?(x)'],
  setupFilesAfterEnv: ['<rootDir>/src/tests/setupIntegrationTests.ts'],
};
