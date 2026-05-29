import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.unit.ts'],
    setupFiles: ['./src/tests/setupUnitTests.ts'],
    alias: {
      // Mock better-auth ESM modules
      'better-auth': resolve(__dirname, './src/tests/mocks/better-auth/index.ts'),
      'better-auth/node': resolve(__dirname, './src/tests/mocks/better-auth/node.ts'),
      'better-auth/plugins': resolve(__dirname, './src/tests/mocks/better-auth/plugins.ts'),
      '@better-auth/oauth-provider': resolve(__dirname, './src/tests/mocks/better-auth/oauth-provider.ts'),
      '@better-auth/passkey': resolve(__dirname, './src/tests/mocks/better-auth/passkey.ts'),
      // Mock MCP SDK ESM modules
      '@modelcontextprotocol/sdk/server/mcp.js': resolve(__dirname, './src/tests/mocks/mcp-sdk/server-mcp.ts'),
      '@modelcontextprotocol/sdk/server/streamableHttp.js': resolve(
        __dirname,
        './src/tests/mocks/mcp-sdk/server-streamable-http.ts',
      ),
      '@bt/shared': resolve(__dirname, '../shared/src'),
      '@routes': resolve(__dirname, './src/routes'),
      '@middlewares': resolve(__dirname, './src/middlewares'),
      '@crons': resolve(__dirname, './src/crons'),
      '@common': resolve(__dirname, './src/common'),
      '@i18n': resolve(__dirname, './src/i18n'),
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
      '@i18n': resolve(__dirname, './src/i18n'),
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
