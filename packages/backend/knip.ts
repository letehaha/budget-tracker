import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: [
    'src/app.ts',
    // Test files as entry points so exports used only in tests are not flagged
    'src/**/*.e2e.ts',
    'src/**/*.unit.ts',
    'src/tests/**',
    // jest config files
    'jest.config.*.ts',
  ],
  ignoreBinaries: ['knip', 'ts-node', 'nodemon', 'cross-env', 'sequelize-cli', 'jest', 'oxlint'],
  ignore: [
    'config/**',
    'src/migrations/**',
    // False positive: imported via @common/types path alias which knip doesn't resolve
    'src/common/types/index.ts',
    // Barrel file re-exporting 3rd-party API types - @public is set on source files
    'src/services/bank-data-providers/enablebanking/types/index.ts',
  ],
  ignoreDependencies: [
    // CLI tool, invoked via npx not imported
    'sequelize-cli',
    // Used in npm scripts, not via imports
    'cross-env',
    'jest',
    'nodemon',
    // Sub-packages bundled with their parent; available at runtime without being listed
    '@jest/globals', // bundled with jest
    'umzug', // bundled with sequelize-cli
  ],
  rules: {
    duplicates: 'off',
  },
};

export default config;
