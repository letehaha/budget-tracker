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
    maxWorkers: Number(process.env.JEST_WORKERS_AMOUNT) || 6,
  },
  resolve: {
    alias: [
      // better-auth mocks — subpath MUST come before the base package
      { find: 'better-auth/node', replacement: resolve(__dirname, './src/tests/mocks/better-auth/node.ts') },
      { find: 'better-auth/plugins', replacement: resolve(__dirname, './src/tests/mocks/better-auth/plugins.ts') },
      { find: 'better-auth', replacement: resolve(__dirname, './src/tests/mocks/better-auth/index.ts') },
      {
        find: '@better-auth/oauth-provider',
        replacement: resolve(__dirname, './src/tests/mocks/better-auth/oauth-provider.ts'),
      },
      { find: '@better-auth/passkey', replacement: resolve(__dirname, './src/tests/mocks/better-auth/passkey.ts') },
      // MCP SDK mocks
      {
        find: '@modelcontextprotocol/sdk/server/mcp.js',
        replacement: resolve(__dirname, './src/tests/mocks/mcp-sdk/server-mcp.ts'),
      },
      {
        find: '@modelcontextprotocol/sdk/server/streamableHttp.js',
        replacement: resolve(__dirname, './src/tests/mocks/mcp-sdk/server-streamable-http.ts'),
      },
      // Investment data-provider mocks. Wired as Vite aliases (not vi.mock):
      // the setup file imports the app, which loads the real provider clients
      // into the module cache before any vi.mock factory can register, and
      // Vitest refuses to replace already-cached modules. Aliases swap at
      // resolution time (before the cache), so they always apply.
      { find: 'yahoo-finance2', replacement: resolve(__dirname, './src/tests/mocks/investments/yahoo-finance2.ts') },
      { find: '@polygon.io/client-js', replacement: resolve(__dirname, './src/tests/mocks/investments/polygon.ts') },
      { find: 'alphavantage', replacement: resolve(__dirname, './src/tests/mocks/investments/alphavantage.ts') },
      {
        find: '@coingecko/coingecko-typescript',
        replacement: resolve(__dirname, './src/tests/mocks/investments/coingecko.ts'),
      },
      { find: 'pdf-parse', replacement: resolve(__dirname, './src/tests/mocks/investments/pdf-parse.ts') },
      // The app imports FmpClient via the ./clients barrel and tests via the
      // concrete file. Match the concrete path so both share one mock instance.
      // Anchored full-match (^.*…$) because alias does `importee.replace(find, …)`
      // — an unanchored regex would replace only the matched substring.
      {
        find: /^.*\/clients\/fmp-client(\.ts)?$/,
        replacement: resolve(__dirname, './src/tests/mocks/investments/fmp-client.ts'),
      },
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
