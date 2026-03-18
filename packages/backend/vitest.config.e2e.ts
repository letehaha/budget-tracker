import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.e2e.ts'],
    setupFiles: ['./src/tests/setupIntegrationTests.ts'],
    testTimeout: 30000,
    pool: 'forks',
    maxConcurrency: Number(process.env.VITEST_WORKERS_AMOUNT) || undefined,
  },
  resolve: {
    alias: [
      // better-auth mocks — subpath MUST come before the base package
      { find: 'better-auth/node', replacement: resolve(__dirname, './src/tests/mocks/better-auth/node.ts') },
      { find: 'better-auth', replacement: resolve(__dirname, './src/tests/mocks/better-auth/index.ts') },
      { find: '@better-auth/passkey', replacement: resolve(__dirname, './src/tests/mocks/better-auth/passkey.ts') },
      // Path aliases
      { find: '@bt/shared', replacement: resolve(__dirname, '../shared/src') },
      { find: '@routes', replacement: resolve(__dirname, './src/routes') },
      { find: '@middlewares', replacement: resolve(__dirname, './src/middlewares') },
      { find: '@crons', replacement: resolve(__dirname, './src/crons') },
      { find: '@common', replacement: resolve(__dirname, './src/common') },
      { find: '@i18n', replacement: resolve(__dirname, './src/i18n') },
      { find: '@controllers', replacement: resolve(__dirname, './src/controllers') },
      { find: '@migrations', replacement: resolve(__dirname, './src/migrations') },
      { find: '@models', replacement: resolve(__dirname, './src/models') },
      { find: '@tests', replacement: resolve(__dirname, './src/tests') },
      { find: '@js', replacement: resolve(__dirname, './src/js') },
      { find: '@services', replacement: resolve(__dirname, './src/services') },
      { find: '@root', replacement: resolve(__dirname, './src') },
      { find: '@config', replacement: resolve(__dirname, './src/config') },
    ],
  },
});
