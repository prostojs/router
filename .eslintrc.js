const { resolve } = require('path');

module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: [resolve(__dirname, './tsconfig.json')],
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  ignorePatterns: [
    '.eslintrc.js',
    'index.js',
    '*.config.js',
    'scripts/*',
    '**/*.cjs.js',
    '**/*.cjs.prod.js',
    '**/*.esm-bundler.js',
    '**/*.esm-browser.js',
    '**/*.esm-browser.prod.js',
    '**/*.global.js',
    '**/*.global.prod.js',
    '**/dist/*.d.ts',
    'explorations/*'
  ],
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'prettier',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  rules: {
    'indent': ['error', 4, { 'SwitchCase': 1 }],
    'comma-dangle': ['error', 'always-multiline'],
    'no-multiple-empty-lines': ['error', { 'max': 1 }],
    'lines-between-class-members': ['error', 'always'],
    'padded-blocks': ['error', 'never'],
    'eol-last': ['error', 'always'],
    'quotes': ['error', 'single'],
    'semi': ['error', 'never'],
    'eol-last': ['error', 'always'],

    // TypeScript
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-empty-interface': 'off',
    // '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-inferrable-types': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-implied-eval': 'off',

    '@typescript-eslint/no-this-alias': 'warn',

    // Allow debugger during development only
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
  },
}
