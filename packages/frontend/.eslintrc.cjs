module.exports = {
  root: true,

  env: {
    browser: true,
    node: true,
  },

  parserOptions: {
    ecmaVersion: 2020,
  },

  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      parserOptions: {
        project: ['./tsconfig.json'],
      },
    },
    {
      files: ['**/__tests__/*.{j,t}s?(x)', '**/tests/unit/**/*.spec.{j,t}s?(x)'],
    },
  ],

  ignorePatterns: ['cypress/**/*', 'cypress.config.ts', 'backend'],

  extends: [
    'plugin:vue/vue3-essential',
    'plugin:vue/vue3-recommended',
    '@vue/airbnb',
    '@vue/eslint-config-typescript/recommended',
    'plugin:prettier-vue/recommended',
    'prettier',
  ],

  plugins: [
    // required to lint *.vue files
    'vue',
  ],

  settings: {
    'import/resolver': {
      typescript: {},
    },
  },

  // add your custom rules here
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 1,
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'no-empty': [
      'error',
      {
        allowEmptyCatch: true,
      },
    ],
    'no-param-reassign': [
      'error',
      {
        props: true,
        ignorePropertyModificationsFor: [
          'acc', // for reduce accumulators
          'e', // for e.returnvalue
        ],
      },
    ],
    // false-positive errors, so offed for now
    'vue/no-setup-props-destructure': 'off',
    'no-unused-vars': 'off',
    'no-useless-catch': 'off',
    'no-underscore-dangle': 'off',
    'no-restricted-syntax': 'off',
    'no-plusplus': 'off',
    'no-shadow': 'off',

    'import/extensions': 'off',
    'import/no-named-as-default': 'off',
    'import/prefer-default-export': 'off',
    'import/no-dynamic-require': 'off',
    'import/no-unresolved': [
      'error',
      {
        ignore: ['.svg'],
      },
    ],
    'import/no-extraneous-dependencies': ['error', { devDependencies: true }],

    'arrow-body-style': 'warn',
    'func-names': [1, 'as-needed'],
    'class-methods-use-this': 'off',
    'arrow-parens': 'off',
    'global-require': 'off',
    'max-len': 'off',
    'prefer-destructuring': 'off',

    'vue/no-v-for-template-key': 'off',
    'vue/max-len': [
      'warn',
      {
        code: 100,
        template: 100,
        tabWidth: 2,
        comments: 100,
        ignorePattern: '',
        ignoreComments: false,
        ignoreTrailingComments: false,
        ignoreUrls: false,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreRegExpLiterals: true,
        ignoreHTMLAttributeValues: false,
        ignoreHTMLTextContents: false,
      },
    ],
    'vue/no-unused-components': 'warn',
    'vue/multi-word-component-names': 'off',
    'vue/no-reserved-component-names': 'off',
    'vuejs-accessibility/click-events-have-key-events': 'off',
    'vuejs-accessibility/form-control-has-label': 'off',
    'vuejs-accessibility/no-autofocus': 'off',
    'vuejs-accessibility/label-has-for': 'off',
    'vue/component-definition-name-casing': [1, 'kebab-case'],
    'vue/no-deprecated-router-link-tag-prop': 'warn',
  },
};
