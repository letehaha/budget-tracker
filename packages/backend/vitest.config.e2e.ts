import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.e2e.ts'],
    setupFiles: ['./src/tests/setupIntegrationTests.ts'],
    testTimeout: 15000,
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: Number(process.env.VITEST_WORKERS_AMOUNT) || undefined,
        memoryLimit: '1GB',
      },
    },
    alias: {
      // Mock better-auth ESM modules
      'better-auth': resolve(__dirname, './src/tests/mocks/better-auth/index.ts'),
      'better-auth/node': resolve(__dirname, './src/tests/mocks/better-auth/node.ts'),
      '@better-auth/passkey': resolve(__dirname, './src/tests/mocks/better-auth/passkey.ts'),
      '@bt/shared': resolve(__dirname, '../shared/src'),
      '@routes': resolve(__dirname, './src/routes'),
      '@middlewares': resolve(__dirname, './src/middlewares'),
      '@crons': resolve(__dirname, './src/crons'),
      '@common': resolve(__dirname, './src/common'),
      '@controllers': resolve(__dirname, './src/controllers'),
      '@migrations': resolve(__dirname, './src/migrations'),
      '@models': resolve(__dirname, './src/models'),
      '@tests': resolve(__dirname, './src/tests'),
      '@js': resolve(__dirname, './src/js'),
      '@services': resolve(__dirname, './src/services'),
      '@root': resolve(__dirname, './src'),
      '@config': resolve(__dirname, './src/config'),
    },
  },
  resolve: {
    alias: {
      '@bt/shared': resolve(__dirname, '../shared/src'),
      '@routes': resolve(__dirname, './src/routes'),
      '@middlewares': resolve(__dirname, './src/middlewares'),
      '@crons': resolve(__dirname, './src/crons'),
      '@common': resolve(__dirname, './src/common'),
      '@controllers': resolve(__dirname, './src/controllers'),
      '@migrations': resolve(__dirname, './src/migrations'),
      '@models': resolve(__dirname, './src/models'),
      '@tests': resolve(__dirname, './src/tests'),
      '@js': resolve(__dirname, './src/js'),
      '@services': resolve(__dirname, './src/services'),
      '@root': resolve(__dirname, './src'),
      '@config': resolve(__dirname, './src/config'),
    },
  },
});
