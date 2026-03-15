import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: [
    'src/app.ts',
    'vitest.config.e2e.ts',
    // Test files as entry points so exports used only in tests are not flagged
    'src/**/*.e2e.ts',
    'src/**/*.unit.ts',
    'src/tests/**',
  ],
  ignoreBinaries: ['knip', 'cross-env', 'oxlint', 'dist/app.js'],
  ignore: [
    'src/migrations/**',
    // False positive: imported via @common/types path alias which knip doesn't resolve
    'src/common/types/index.ts',
    // Barrel file re-exporting 3rd-party API types - @public is set on source files
    'src/services/bank-data-providers/enablebanking/types/index.ts',
  ],
  ignoreDependencies: [
    // Used in npm scripts, not via imports
    'cross-env',
  ],
  rules: {
    duplicates: 'off',
  },
};

export default config;
