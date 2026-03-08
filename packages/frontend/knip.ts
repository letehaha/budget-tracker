import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  // TODO: fix because it's wrong ignoring them
  ignoreBinaries: ['knip', 'vue-tsc', 'vitest', 'storybook', 'playwright', 'oxlint'],
  ignore: [
    'wallaby.js',
    'tests/**/**',
    'e2e/**/**',
    // keep them all for now
    'src/components/lib/**/**',
  ],
  ignoreDependencies: [
    // Needed for Storybook
    'react',
    'react-dom',
    // Storybook
    'storybook',
    '@storybook/cli',
    '@storybook/theming',
    '@storybook/vue3',
    '@storybook/addon-docs',
    '@storybook/addon-actions',
    // needed for build
    'vue-tsc',

    // peerDependency of v-calendar
    '@popperjs/core',
  ],
  rules: {
    // Disables "Dubplicate exports" warning. In some components we want to keep
    // exporting the component both as the variable and as a "default export"
    duplicates: 'off',
    // enumMembers: "off",
  },
};

export default config;
