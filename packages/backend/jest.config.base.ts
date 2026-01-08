/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */

export default {
  preset: 'ts-jest',
  verbose: true,
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(spec).[jt]s?(x)'],
  transform: {
    '^.+\\.ts?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },
  moduleNameMapper: {
    // Mock better-auth ESM modules with our CommonJS compatible versions
    '^better-auth$': '<rootDir>/src/tests/mocks/better-auth/index.ts',
    '^better-auth/node$': '<rootDir>/src/tests/mocks/better-auth/node.ts',
    '^@better-auth/passkey$': '<rootDir>/src/tests/mocks/better-auth/passkey.ts',
    '@bt/shared/(.*)': '<rootDir>/../shared/src/$1',
    '@routes/(.*)': '<rootDir>/src/routes/$1',
    '@middlewares/(.*)': '<rootDir>/src/middlewares/$1',
    '@crons/(.*)': '<rootDir>/src/crons/$1',
    '@common/(.*)': '<rootDir>/src/common/$1',
    '@i18n/(.*)': '<rootDir>/src/i18n/$1',
    '@controllers/(.*)': '<rootDir>/src/controllers/$1',
    '@migrations/(.*)': '<rootDir>/src/migrations/$1',
    '@models/(.*)': '<rootDir>/src/models/$1',
    '@tests/(.*)': '<rootDir>/src/tests/$1',
    '@js/(.*)': '<rootDir>/src/js/$1',
    '@services/(.*)': '<rootDir>/src/services/$1',
    '@root/(.*)': '<rootDir>/src/$1',
    '@config/(.*)': '<rootDir>/src/config/$1',
  },
};
