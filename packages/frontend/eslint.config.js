import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import vueI18n from '@intlify/eslint-plugin-vue-i18n';
import eslintPluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import typescriptEslint from 'typescript-eslint';

export default typescriptEslint.config(
  { ignores: ['*.d.ts', '**/coverage', '**/dist', '**/landing/**', '**/legal/**', 'vite.config.js'] },
  {
    extends: [
      eslint.configs.recommended,
      ...typescriptEslint.configs.recommended,
      ...eslintPluginVue.configs['flat/base'],
    ],
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: {
        parser: typescriptEslint.parser,
      },
    },
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  // vue-i18n rules
  ...vueI18n.configs['flat/recommended'],
  {
    rules: {
      // Detect hardcoded strings that should be localized
      '@intlify/vue-i18n/no-raw-text': [
        'warn',
        {
          ignorePattern: '^[-#:()&/+•·→←↓↑=.,;—!~🏦ℹ️⚠️|?%$@0-9"\'\\s]+$',
          ignoreNodes: ['md-icon', 'v-icon'],
          ignoreText: ['EUR', 'USD', 'UAH', '*', '', 'MoneyMatter', '0f711c28-1682-27b5-946c-e221168abf79'],
        },
      ],
      // Detect missing keys in locale files
      '@intlify/vue-i18n/no-missing-keys': 'error',
      // Warn about unused keys (can be noisy, set to warn)
      '@intlify/vue-i18n/no-unused-keys': [
        'warn',
        {
          extensions: ['.ts', '.vue'],
          enableFix: false,
        },
      ],
    },
    settings: {
      'vue-i18n': {
        localeDir: './src/i18n/locales/chunks/{en,uk}/**/*.json',
        messageSyntaxVersion: '^11.0.0',
      },
    },
  },
  eslintConfigPrettier,
);
