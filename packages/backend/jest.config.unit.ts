import baseConfig from './jest.config.base';

console.log('❗ RUNNING UNIT TESTS');

/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
export default {
  ...baseConfig,
  testMatch: ['<rootDir>/src/**/?(*.)+(unit).[jt]s?(x)'],
  setupFilesAfterEnv: ['<rootDir>/src/tests/setupUnitTests.ts'],
};
