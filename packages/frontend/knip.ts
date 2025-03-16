// eslint-disable-next-line import/no-self-import
import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  ignore: [
    '.eslintrc.js',
    'index.d.ts',
    'vite.config.js',
    'backend/**/**',
    'wallaby.js',
    // keep it for now, delete when Playwright added
    'tests/**/**',
    'cypress/**/**',
    // keep them all for now
    'src/components/lib/**/**',
    // for some reason it cannot resolve it
    'tsconfig.json',
  ],
  ignoreDependencies: [
    // Needed for Storybook
    'react-dom',
    // Storybook
    '@storybook/cli',
    '@storybook/theming',
    '@storybook/vue3',
    '@storybook/addon-docs',
    '@storybook/addon-actions',
    // needed on CI
    'shared-types',
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
  eslint: {
    config: ['.eslintrc', '.eslintrc.cjs'],
    entry: ['.eslintrc.cjs'],
  },
  /**
   * PLUGINS END
   */
};

export default config;
