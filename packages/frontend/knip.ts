import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  // TODO: fix because it's wrong ignoring them
  ignoreBinaries: ['knip', 'vue-tsc', 'vite', 'vitest', 'storybook', 'cypress'],
  ignore: [
    '.eslintrc.js',
    'index.d.ts',
    'vite.config.js',
    'backend/**/**',
    'wallaby.js',
    // keep it for now, delete when Playwright added
    'tests/**/**',
    'cypress/**/**',
    'cypress.config.ts',
    // keep them all for now
    'src/components/lib/**/**',
    // for some reason it cannot resolve it
    'tsconfig.json',
  ],
  ignoreDependencies: [
    // actually used
    'sass',
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
    // eslint
    '@eslint/js',
  ],
  // ignoreBinaries: ["eslint"],
  rules: {
    // Disables "Dubplicate exports" warning. In some components we want to keep
    // exporting the component both as the variable and as a "default export"
    duplicates: 'off',
    // enumMembers: "off",
  },

  /**
   * PLUGINS
   *
   * We define them manually, because Knip cannot find them automatically.
   * We need them defined, so Knip won't report of unused dependencies and will
   * respect plugins configs.
   */
  eslint: ['eslint.config.js'],
  /**
   * PLUGINS END
   */
};

export default config;
